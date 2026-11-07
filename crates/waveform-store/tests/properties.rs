//! What a decimated waveform still tells you truthfully, and what it does not.
//!
//! A reduced trace is only useful if it stands in for the real one. The
//! precise way to say that is: which measurements of the signal survive the
//! reduction? These tests answer it per measurement, on waveforms shaped
//! like the ones a converter actually produces, and they are as interested
//! in the measurements that do *not* survive — because a measurement that
//! quietly changes under decimation is worse than one that is refused.
//!
//! The short version, established below:
//!
//! | measurement | under min/max envelope |
//! |---|---|
//! | max, min | **exact**, at every budget |
//! | peak-to-peak | **exact** |
//! | every sample inside the drawn band | **guaranteed** |
//! | mean | within 0.03% while buckets stay finer than the waveform's period; structurally wrong once they span many periods |
//! | RMS | biased high, for the same reason |
//!
//! So most of what you would measure does survive — on the condition that
//! the reduction is fine relative to the features of the signal. A budget
//! tied to the plot's pixel width, over a window the user has zoomed into,
//! is in that regime. The whole-extent view of a very long run is not.
//!
//! Which gives the rule these tests exist to pin down: **a measurement is
//! computed on the samples, never on the reduced view the chart is drawn
//! from.** When the samples move to a server, the measurement moves with
//! them. The chart can be an approximation; a number with a unit after it
//! cannot.

use gs_waveform_store::decimate::{decimate_indices_by_time_bucket, minmax_envelope};

const BUDGET: usize = 2000;

fn max_of(values: &[f64]) -> f64 {
    values.iter().copied().fold(f64::MIN, f64::max)
}

fn min_of(values: &[f64]) -> f64 {
    values.iter().copied().fold(f64::MAX, f64::min)
}

fn mean_of(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}

fn rms_of(values: &[f64]) -> f64 {
    (values.iter().map(|v| v * v).sum::<f64>() / values.len() as f64).sqrt()
}

// ---------------------------------------------------------------------------
// Waveforms a converter actually produces.
// ---------------------------------------------------------------------------

fn time_axis(n: usize, dt: f64) -> Vec<f64> {
    (0..n).map(|i| i as f64 * dt).collect()
}

/// A 50 Hz grid voltage. Smooth, symmetric — the easy case.
fn grid_sine(n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| 325.0 * (2.0 * std::f64::consts::PI * 50.0 * i as f64 * 1e-7).sin())
        .collect()
}

/// A 100 kHz switch node at 25% duty with one sample of ringing overshoot.
/// Asymmetric on purpose: this is where a mean goes wrong.
fn switch_node(n: usize) -> Vec<f64> {
    let mut values: Vec<f64> = (0..n)
        .map(|i| {
            let phase = ((i as f64 * 1e-8) * 100e3).fract();
            if phase < 0.25 {
                48.0
            } else {
                -0.7
            }
        })
        .collect();
    let spike = n * 3 / 4 + 1237;
    if spike < n {
        values[spike] = 96.0;
    }
    values
}

/// An inductor current: triangular ripple on a settling DC level.
fn inductor_current(n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| {
            let t = i as f64 * 1e-8;
            let ripple = (((t * 100e3).fract()) - 0.5) * 4.0;
            8.0 * (1.0 - (-t * 5000.0).exp()) + ripple
        })
        .collect()
}

fn waveforms(n: usize) -> Vec<(&'static str, Vec<f64>)> {
    vec![
        ("grid sine", grid_sine(n)),
        ("switch node", switch_node(n)),
        ("inductor current", inductor_current(n)),
    ]
}

// ---------------------------------------------------------------------------
// Preserved exactly
// ---------------------------------------------------------------------------

#[test]
fn the_envelope_preserves_max_and_min_exactly() {
    // Not approximately. Every bucket contributes its own extremes, and the
    // global extreme is the extreme of some bucket, so it is always emitted.
    // This is the property the whole scheme is built on: you cannot read a
    // peak off a chart that threw the peak away.
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    for (name, values) in waveforms(n) {
        let (_, reduced) = minmax_envelope(&time, &[&values], BUDGET);
        assert_eq!(max_of(&reduced[0]), max_of(&values), "{name}: max changed");
        assert_eq!(min_of(&reduced[0]), min_of(&values), "{name}: min changed");
    }
}

#[test]
fn the_envelope_preserves_peak_to_peak_exactly() {
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    for (name, values) in waveforms(n) {
        let (_, reduced) = minmax_envelope(&time, &[&values], BUDGET);
        let before = max_of(&values) - min_of(&values);
        let after = max_of(&reduced[0]) - min_of(&reduced[0]);
        assert_eq!(after, before, "{name}: peak-to-peak changed");
    }
}

#[test]
fn it_holds_at_every_budget_from_coarse_to_fine() {
    let n = 100_000;
    let time = time_axis(n, 1e-8);
    let values = switch_node(n);
    for budget in [8, 50, 500, 5000, 50_000] {
        let (_, reduced) = minmax_envelope(&time, &[&values], budget);
        assert_eq!(max_of(&reduced[0]), max_of(&values), "budget {budget}");
        assert_eq!(min_of(&reduced[0]), min_of(&values), "budget {budget}");
    }
}

#[test]
fn no_sample_lies_outside_the_band_that_is_drawn() {
    /*
     * The precise form of "the reduced trace resembles the real one": for
     * every original sample there is a drawn bucket whose two emitted
     * values bracket it. Nothing the signal did is hidden outside what the
     * eye can see on the chart.
     *
     * This is what makes an envelope honest in a way that averaging and
     * stride sampling are not — both can draw a smooth line through a
     * region where the signal was swinging violently.
     */
    let n = 100_000;
    let time = time_axis(n, 1e-8);
    let values = inductor_current(n);
    let budget = 1000;

    let (_, reduced) = minmax_envelope(&time, &[&values], budget);
    let pairs = &reduced[0];
    let n_buckets = pairs.len() / 2;
    let bucket_size = n as f64 / (budget / 2) as f64;

    for (i, &sample) in values.iter().enumerate() {
        let bucket = ((i as f64 / bucket_size) as usize).min(n_buckets - 1);
        let lo = pairs[bucket * 2].min(pairs[bucket * 2 + 1]);
        let hi = pairs[bucket * 2].max(pairs[bucket * 2 + 1]);
        assert!(
            sample >= lo && sample <= hi,
            "sample {i} = {sample} falls outside its bucket's drawn band [{lo}, {hi}]"
        );
    }
}

// ---------------------------------------------------------------------------
// Not preserved — and these are the ones worth knowing about
// ---------------------------------------------------------------------------

#[test]
fn the_mean_of_an_envelope_drifts_as_the_reduction_coarsens() {
    /*
     * A 25% duty square spends three quarters of its time at -0.7 V and a
     * quarter at 48 V, so its mean is about 11.5 V. The envelope emits one
     * low and one high per bucket, which over-weights the high.
     *
     * How wrong that gets is not a constant — it depends on the bucket size
     * against the waveform's own period, and that is the insight worth
     * writing down:
     *
     *   - buckets much *finer* than a switching period: most of them sit
     *     entirely at one level and emit it twice, so the mean is roughly
     *     right by luck.
     *   - buckets much *coarser*: nearly every one straddles an edge and
     *     emits (-0.7, 48), so the mean converges on the midpoint of the
     *     two levels — a value the signal is never at.
     *
     * Which means the error grows exactly as you zoom out, and a long run
     * viewed whole is the worst case. The rule follows: a measurement is
     * computed on the samples, never on the reduction the chart is drawn
     * from.
     */
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    let values = switch_node(n);
    let truth = mean_of(&values);
    assert!(
        truth > 10.0 && truth < 13.0,
        "the 25% duty square's real mean, got {truth}"
    );

    // The switching period here is 1,000 samples. Budget b gives b/2
    // buckets, so b = 400 is 1,000 samples per bucket — one whole period —
    // and b = 20 is twenty of them.
    let error_at = |budget: usize| {
        let (_, reduced) = minmax_envelope(&time, &[&values], budget);
        (mean_of(&reduced[0]) - truth).abs() / truth.abs()
    };

    let fine = error_at(20_000);
    let coarse = error_at(20);

    assert!(
        coarse > fine,
        "the error should grow as the reduction coarsens: fine {fine:.3}, coarse {coarse:.3}"
    );
    assert!(
        coarse > 0.5,
        "zoomed out, the envelope's mean should be structurally wrong, not merely noisy; got {coarse:.3}"
    );

    // And the other half of the finding, which is the better news: while
    // the buckets stay fine against the waveform's period, the mean comes
    // through essentially intact — measured at 0.03% here. So a reduction
    // whose budget tracks the pixel width, over a window the user has
    // zoomed into, is in the regime where this holds. It is the zoomed-out
    // view of a long run that is not.
    assert!(
        fine < 0.01,
        "a fine reduction should keep the mean; got {fine:.4}"
    );
}

#[test]
fn rms_from_an_envelope_is_biased_high() {
    // Same cause: an envelope is made of extremes, and RMS weights them.
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    let values = switch_node(n);
    let (_, reduced) = minmax_envelope(&time, &[&values], BUDGET);
    assert!(
        rms_of(&reduced[0]) > rms_of(&values),
        "RMS of an envelope should over-report, which is the point being documented"
    );
}

#[test]
fn a_symmetric_waveform_hides_the_problem_which_is_why_it_is_not_the_test() {
    /*
     * On a sine the envelope's mean is near zero and so is the signal's, so
     * a test written only against a sine would conclude that the mean
     * survives decimation. It does not; the sine is simply symmetric enough
     * to conceal it. Kept as a test so the next person reads why the
     * asymmetric case above is the one that counts.
     */
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    let values = grid_sine(n);
    let (_, reduced) = minmax_envelope(&time, &[&values], BUDGET);
    assert!(mean_of(&values).abs() < 1.0);
    assert!(mean_of(&reduced[0]).abs() < 1.0);
}

// ---------------------------------------------------------------------------
// Against the reduction this replaced
// ---------------------------------------------------------------------------

#[test]
fn time_bucketing_loses_the_peaks_the_envelope_keeps() {
    /*
     * The measurement that motivated the change, as a test. Time bucketing
     * keeps the first and last sample of each bucket — one shared grid, and
     * no idea what happened in between. On a switch node its reported peak
     * is the steady 48 V level; the 96 V overshoot that would destroy the
     * device is simply absent.
     */
    let n = 200_000;
    let time = time_axis(n, 1e-8);
    let values = switch_node(n);
    let parent: Vec<usize> = (0..n).collect();

    let selected = decimate_indices_by_time_bucket(&time, BUDGET, &parent);
    let by_time_peak = selected.iter().map(|&i| values[i]).fold(f64::MIN, f64::max);

    let (_, reduced) = minmax_envelope(&time, &[&values], BUDGET);
    let by_envelope_peak = max_of(&reduced[0]);

    assert_eq!(max_of(&values), 96.0, "the planted overshoot");
    assert_eq!(by_time_peak, 48.0, "time bucketing is expected to miss it");
    assert_eq!(by_envelope_peak, 96.0, "the envelope must not");
}

#[test]
fn every_signal_still_shares_one_grid() {
    // The property time bucketing was chosen for in the first place, and
    // which the envelope had to keep: a chart draws every trace against a
    // single x vector.
    let n = 50_000;
    let time = time_axis(n, 1e-8);
    let a = switch_node(n);
    let b = inductor_current(n);
    let c = grid_sine(n);

    let (grid, columns) = minmax_envelope(&time, &[&a, &b, &c], BUDGET);
    assert!(grid.len() <= BUDGET);
    for column in &columns {
        assert_eq!(column.len(), grid.len());
    }
    assert!(
        grid.windows(2).all(|w| w[0] <= w[1]),
        "the grid must stay monotonic"
    );

    // And each of them keeps its own extremes on that shared grid.
    for (name, original, reduced) in [
        ("a", &a, &columns[0]),
        ("b", &b, &columns[1]),
        ("c", &c, &columns[2]),
    ] {
        assert_eq!(max_of(reduced), max_of(original), "{name}: max");
        assert_eq!(min_of(reduced), min_of(original), "{name}: min");
    }
}

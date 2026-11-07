//! Peak-preserving decimation.
//!
//! Both strategies below are ports of
//! `packages/simulator/src/simulator/postprocess/decimation.py`, kept
//! deliberately faithful. The point of this crate is that the server and the
//! viewer stop disagreeing about what a reduced waveform looks like — there
//! were three implementations of this (two in Python, one in TypeScript) and
//! a trace could change shape depending on which one produced it.

/// Python's `round()` is half-to-even; Rust's `f64::round` is half-away-from-zero.
///
/// Bucket edges are computed as `round(i * bucket_size)`, and an exact .5
/// lands there whenever the bucket size is a half-integer — which happens
/// for any `max_points` that divides the sample count into halves. Getting
/// it wrong shifts a bucket boundary by one sample and the two
/// implementations select different extrema. It is a small difference that
/// would be very annoying to chase, so it is simply matched.
fn round_half_even(value: f64) -> f64 {
    let rounded = value.round();
    if (value - value.trunc()).abs() == 0.5 && rounded % 2.0 != 0.0 {
        rounded - value.signum()
    } else {
        rounded
    }
}

fn bucket_bounds(index: usize, bucket_size: f64, n: usize) -> (usize, usize) {
    let lo = round_half_even(index as f64 * bucket_size) as usize;
    let hi = (round_half_even((index + 1) as f64 * bucket_size) as usize).min(n);
    (lo, hi)
}

/// Index of the smallest value in `slice`, first one wins (as `np.argmin`).
fn argmin(slice: &[f64]) -> usize {
    let mut best = 0;
    for (i, v) in slice.iter().enumerate() {
        if v < &slice[best] {
            best = i;
        }
    }
    best
}

fn argmax(slice: &[f64]) -> usize {
    let mut best = 0;
    for (i, v) in slice.iter().enumerate() {
        if v > &slice[best] {
            best = i;
        }
    }
    best
}

/// Indices into `values` selecting at most `max_points` entries, keeping the
/// extremes of each bucket.
///
/// This is genuine envelope decimation: a spike in the middle of a bucket
/// survives whatever the reduction factor, which mean-averaging and stride
/// sampling both destroy. On a switching waveform that is the difference
/// between seeing an overshoot and not knowing it happened.
pub fn minmax_decimate_by_value(values: &[f64], max_points: usize) -> Vec<usize> {
    let n = values.len();
    if n <= max_points || max_points < 2 {
        return (0..n).collect();
    }

    let n_buckets = max_points / 2;
    let bucket_size = n as f64 / n_buckets as f64;

    let mut indices: Vec<usize> = Vec::with_capacity(max_points);
    for i in 0..n_buckets {
        let (lo, hi) = bucket_bounds(i, bucket_size, n);
        if lo >= n {
            break;
        }
        let bucket = &values[lo..hi];
        if bucket.is_empty() {
            continue;
        }
        let min_idx = argmin(bucket) + lo;
        let max_idx = argmax(bucket) + lo;
        let (first, second) = if min_idx <= max_idx {
            (min_idx, max_idx)
        } else {
            (max_idx, min_idx)
        };
        indices.push(first);
        if second != first {
            indices.push(second);
        }
    }

    if indices.is_empty() {
        return (0..n).collect();
    }
    indices.sort_unstable();
    indices.dedup();
    indices
}

/// The entries of `parent` selected by bucketing the *time* axis.
///
/// Time is monotonic, so this keeps the first and last sample of each
/// bucket. It does not preserve value peaks — and that is the trade it
/// exists to make: every signal in a multi-signal query comes back on one
/// shared time grid, which is what a chart needs to draw them together.
pub fn decimate_indices_by_time_bucket(
    time_window: &[f64],
    max_points: usize,
    parent: &[usize],
) -> Vec<usize> {
    let n = time_window.len();
    if n <= max_points || max_points < 2 {
        return parent.to_vec();
    }

    let n_buckets = max_points / 2;
    let bucket_size = n as f64 / n_buckets as f64;

    let mut selected: Vec<usize> = Vec::with_capacity(max_points);
    for i in 0..n_buckets {
        let (lo, hi) = bucket_bounds(i, bucket_size, n);
        if lo >= n {
            break;
        }
        let bucket = &time_window[lo..hi];
        if bucket.is_empty() {
            continue;
        }
        let min_local = argmin(bucket) + lo;
        let max_local = argmax(bucket) + lo;
        let (first, second) = if min_local <= max_local {
            (min_local, max_local)
        } else {
            (max_local, min_local)
        };
        selected.push(parent[first]);
        if second != first {
            selected.push(parent[second]);
        }
    }

    if selected.is_empty() {
        return parent.to_vec();
    }
    selected
}

/// The index range of `time` covering `[from, to]`, with one sample beyond
/// each edge so a trace is drawn to the border rather than stopping short.
///
/// Binary search: this runs per signal per view, over arrays that are
/// millions of samples long.
pub fn window_indices(time: &[f64], from: f64, to: f64) -> (usize, usize) {
    let n = time.len();
    if n == 0 {
        return (0, 0);
    }
    let lower_bound = |target: f64| -> usize { time.partition_point(|&t| t < target) };

    let start = lower_bound(from).saturating_sub(1);
    let end = lower_bound(to).min(n - 1).max(start);
    (start, end)
}

/// One bucket of a shared-grid envelope: two output points, and for each
/// signal the pair of values that spans what it did inside the bucket.
///
/// ## Why this exists
///
/// `decimate_indices_by_time_bucket` keeps the first and last sample of each
/// bucket. That gives every signal one shared time grid, which is what a
/// chart needs — and it cannot see what happened in between. On a measured
/// 50-million-sample switching node with one sample of 96 V overshoot, it
/// reports a 48 V peak. The overshoot is simply gone, and in power
/// electronics that is the one failure you cannot afford to miss: it is the
/// transient that destroys the device.
///
/// `minmax_decimate_by_value` does preserve it, but selects different
/// indices for every signal, so a multi-signal query would come back on
/// several grids and could not be drawn together.
///
/// This resolves both. The *time* axis is bucketed, so the grid stays
/// shared; within each bucket every signal contributes its own minimum and
/// maximum, emitted in the order they occurred so the trace keeps its
/// direction of travel. Each bucket becomes a short vertical excursion
/// covering the real range of the data it stands for — which is what an
/// oscilloscope draws, and for the same reason.
///
/// The budget is unchanged: `max_points / 2` buckets, two points each.
pub fn minmax_envelope(
    time: &[f64],
    columns: &[&[f64]],
    max_points: usize,
) -> (Vec<f64>, Vec<Vec<f64>>) {
    let n = time.len();
    if n <= max_points || max_points < 4 {
        return (time.to_vec(), columns.iter().map(|c| c.to_vec()).collect());
    }

    let n_buckets = max_points / 2;
    let bucket_size = n as f64 / n_buckets as f64;

    let mut out_time = Vec::with_capacity(max_points);
    let mut out_values: Vec<Vec<f64>> = columns
        .iter()
        .map(|_| Vec::with_capacity(max_points))
        .collect();

    for i in 0..n_buckets {
        let (lo, hi) = bucket_bounds(i, bucket_size, n);
        if lo >= n {
            break;
        }
        if hi <= lo {
            continue;
        }

        // The bucket's own time bounds, so consecutive buckets join up.
        out_time.push(time[lo]);
        out_time.push(time[hi - 1]);

        for (column_index, column) in columns.iter().enumerate() {
            let bucket = &column[lo..hi];
            let min_at = argmin(bucket);
            let max_at = argmax(bucket);
            // Emitted in the order they happened: a rising edge then reads
            // low-then-high, a falling one high-then-low, and the envelope
            // keeps the shape of the waveform rather than flattening it
            // into a band.
            let (first, second) = if min_at <= max_at {
                (bucket[min_at], bucket[max_at])
            } else {
                (bucket[max_at], bucket[min_at])
            };
            out_values[column_index].push(first);
            out_values[column_index].push(second);
        }
    }

    if out_time.is_empty() {
        return (time.to_vec(), columns.iter().map(|c| c.to_vec()).collect());
    }
    (out_time, out_values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_everything_below_the_budget() {
        let values = vec![1.0, 2.0, 3.0];
        assert_eq!(minmax_decimate_by_value(&values, 10), vec![0, 1, 2]);
    }

    #[test]
    fn a_spike_survives_whatever_the_reduction() {
        // The property that rules out averaging and stride sampling: a
        // transient one sample wide, in a 10,000-sample run reduced to 20
        // points, must still be on the chart.
        let mut values = vec![0.0; 10_000];
        values[7_777] = 99.0;
        let indices = minmax_decimate_by_value(&values, 20);
        assert!(indices.len() <= 20);
        assert!(indices.contains(&7_777), "the spike was decimated away");
    }

    #[test]
    fn keeps_both_extremes_of_a_bucket() {
        let mut values = vec![0.0; 1000];
        values[10] = -5.0;
        values[20] = 7.0;
        let indices = minmax_decimate_by_value(&values, 4);
        assert!(indices.contains(&10));
        assert!(indices.contains(&20));
    }

    #[test]
    fn returns_indices_in_ascending_order_without_repeats() {
        let values: Vec<f64> = (0..5000).map(|i| (i as f64 / 100.0).sin()).collect();
        let indices = minmax_decimate_by_value(&values, 200);
        assert!(indices.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn half_to_even_matches_python() {
        assert_eq!(round_half_even(0.5), 0.0);
        assert_eq!(round_half_even(1.5), 2.0);
        assert_eq!(round_half_even(2.5), 2.0);
        assert_eq!(round_half_even(3.5), 4.0);
        assert_eq!(round_half_even(-0.5), -0.0);
        assert_eq!(round_half_even(-1.5), -2.0);
        assert_eq!(round_half_even(2.4), 2.0);
        assert_eq!(round_half_even(2.6), 3.0);
    }

    #[test]
    fn time_buckets_give_every_signal_one_grid() {
        let time: Vec<f64> = (0..1000).map(|i| i as f64 * 1e-6).collect();
        let parent: Vec<usize> = (0..1000).collect();
        let selected = decimate_indices_by_time_bucket(&time, 100, &parent);
        assert!(selected.len() <= 100);
        assert!(selected.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn the_envelope_keeps_a_spike_that_time_bucketing_loses() {
        // The measurement that motivated it: one sample of 96 V overshoot
        // in a 50,000-sample run, deliberately not on a bucket boundary.
        let n = 50_000;
        let time: Vec<f64> = (0..n).map(|i| i as f64 * 1e-8).collect();
        let mut values = vec![48.0; n];
        let spike = n * 3 / 4 + 1237;
        values[spike] = 96.0;

        let parent: Vec<usize> = (0..n).collect();
        let by_time = decimate_indices_by_time_bucket(&time, 3000, &parent);
        let time_peak = by_time.iter().map(|&i| values[i]).fold(f64::MIN, f64::max);
        assert_eq!(time_peak, 48.0, "time bucketing is expected to lose it");

        let (_, envelope) = minmax_envelope(&time, &[&values], 3000);
        let envelope_peak = envelope[0].iter().copied().fold(f64::MIN, f64::max);
        assert_eq!(envelope_peak, 96.0, "the envelope must not lose it");
    }

    #[test]
    fn the_envelope_keeps_every_signal_on_one_grid() {
        // The property time bucketing was chosen for, and which value
        // bucketing per signal would have thrown away.
        let n = 10_000;
        let time: Vec<f64> = (0..n).map(|i| i as f64 * 1e-6).collect();
        let a: Vec<f64> = (0..n).map(|i| (i as f64 / 50.0).sin()).collect();
        let b: Vec<f64> = (0..n).map(|i| (i as f64 / 37.0).cos() * 20.0).collect();

        let (grid, columns) = minmax_envelope(&time, &[&a, &b], 400);
        assert!(grid.len() <= 400);
        assert_eq!(columns[0].len(), grid.len());
        assert_eq!(columns[1].len(), grid.len());
        assert!(
            grid.windows(2).all(|w| w[0] <= w[1]),
            "grid must stay monotonic"
        );
    }

    #[test]
    fn the_envelope_spans_each_bucket_rather_than_sampling_it() {
        // A bucket must report what the signal really did inside it, so the
        // drawn excursion covers the range rather than two arbitrary points.
        let n = 4000;
        let time: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let values: Vec<f64> = (0..n)
            .map(|i| if i % 2 == 0 { -1.0 } else { 1.0 })
            .collect();
        let (_, columns) = minmax_envelope(&time, &[&values], 100);
        let lo = columns[0].iter().copied().fold(f64::MAX, f64::min);
        let hi = columns[0].iter().copied().fold(f64::MIN, f64::max);
        assert_eq!((lo, hi), (-1.0, 1.0));
    }

    #[test]
    fn the_envelope_hands_back_small_data_untouched() {
        let time = vec![0.0, 1.0, 2.0];
        let values = vec![10.0, 20.0, 30.0];
        let (grid, columns) = minmax_envelope(&time, &[&values], 3000);
        assert_eq!(grid, time);
        assert_eq!(columns[0], values);
    }

    #[test]
    fn window_brackets_the_requested_range() {
        let time: Vec<f64> = (0..100).map(|i| i as f64).collect();
        let (start, end) = window_indices(&time, 10.0, 20.0);
        // One sample beyond each edge, so the trace reaches the border...
        assert!(time[start] <= 10.0);
        assert!(time[end] >= 20.0);
        // ...and exactly one. `>=` rather than `>`: when a window edge falls
        // exactly on a sample — which it does whenever the view is fitted to
        // the data — that sample is the first one inside, and the bracket is
        // the one before it.
        assert!(time[start + 1] >= 10.0);
        assert!(time[start + 2] > 10.0);
    }

    #[test]
    fn window_clamps_rather_than_running_off_the_array() {
        let time: Vec<f64> = (0..100).map(|i| i as f64).collect();
        assert_eq!(window_indices(&time, -5.0, 500.0), (0, 99));
        assert_eq!(window_indices(&[], 0.0, 1.0), (0, 0));
    }
}

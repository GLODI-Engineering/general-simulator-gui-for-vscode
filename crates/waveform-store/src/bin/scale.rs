//! How the window decimator behaves as a run gets large.
//!
//! The question this answers is the one that decides whether a hosted
//! deployment is affordable: when a converter simulation produces gigabytes,
//! what does it cost to put a readable picture of it on a 1500-pixel plot?
//!
//! The waveform generated here is deliberately the hard case for a
//! decimator — a hard-switching node with sub-sample edges riding a slow
//! envelope — because a smooth signal hides exactly the failure mode that
//! matters: a transient one sample wide being averaged away.
//!
//! Run: cargo run --release --bin scale

use std::time::Instant;

use gs_waveform_store::decimate::{
    decimate_indices_by_time_bucket, minmax_envelope, window_indices,
};

/// A 100 kHz switching node over `n` samples, with a transient planted in it.
fn switching_waveform(n: usize) -> (Vec<f64>, Vec<f64>) {
    let dt = 1e-8;
    let fsw = 100e3;
    let mut time = Vec::with_capacity(n);
    let mut values = Vec::with_capacity(n);
    for k in 0..n {
        let t = k as f64 * dt;
        let phase = (t * fsw).fract();
        let on = phase < 0.25;
        let envelope = 48.0 * (1.0 - (-t * 400.0).exp());
        time.push(t);
        values.push(if on { envelope } else { -0.7 });
    }
    // One sample of overshoot, three quarters of the way in — plus a prime
    // offset, so it does NOT land on a bucket boundary. Without the offset
    // the spike sits exactly on one for any round n, is kept by accident,
    // and the benchmark reports a peak-preservation that the algorithm does
    // not have.
    if n > 16 {
        values[spike_index(n)] = 96.0;
    }
    (time, values)
}

/// Where the planted overshoot is. Deliberately not a round fraction of n.
pub fn spike_index(n: usize) -> usize {
    (n * 3 / 4 + 1237).min(n - 1)
}

fn human_bytes(bytes: usize) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

fn main() {
    // What a 1500 px plot can actually distinguish: two points per pixel,
    // one for the top of each column and one for the bottom.
    const BUDGET: usize = 3000;
    const SIGNALS: usize = 11;

    let sizes: Vec<usize> = std::env::args()
        .skip(1)
        .filter_map(|arg| arg.parse().ok())
        .collect();
    let sizes = if sizes.is_empty() {
        vec![1_000_000, 10_000_000, 50_000_000]
    } else {
        sizes
    };

    println!(
        "{:>14}  {:>10}  {:>12}  {:>12}  {:>12}  {:>12}",
        "samples/signal", "per signal", "full extent", "1% window", "time-bucket", "envelope"
    );

    for n in sizes {
        let (time, values) = switching_waveform(n);
        let per_signal = n * 8;

        // Full extent: the first paint, the worst case.
        let parent: Vec<usize> = (0..n).collect();
        let started = Instant::now();
        let (_, envelope) = minmax_envelope(&time, &[&values], BUDGET);
        let full_ms = started.elapsed().as_secs_f64() * 1e3;

        // The old path, for comparison: what the overshoot looks like to a
        // reduction that only keeps each bucket's first and last sample.
        let selected = decimate_indices_by_time_bucket(&time, BUDGET, &parent);

        // A 1% window: what every zoom after the first one costs.
        let span = time[n - 1] - time[0];
        let from = time[0] + span * 0.74;
        let to = from + span * 0.01;
        let started = Instant::now();
        let (start, end) = window_indices(&time, from, to);
        let (_, _picked) = minmax_envelope(&time[start..=end], &[&values[start..=end]], BUDGET);
        let window_ms = started.elapsed().as_secs_f64() * 1e3;

        // Did the one-sample overshoot survive? The real peak is 96 V.
        let by_time_peak = selected.iter().map(|&i| values[i]).fold(f64::MIN, f64::max);
        let envelope_peak = envelope[0].iter().copied().fold(f64::MIN, f64::max);

        println!(
            "{:>14}  {:>10}  {:>10.1} ms  {:>10.1} ms  {:>9.0} V  {:>9.0} V",
            n,
            human_bytes(per_signal),
            full_ms,
            window_ms,
            by_time_peak,
            envelope_peak,
        );
        let _ = SIGNALS;
    }

    println!();
    println!("A run of {SIGNALS} signals costs {SIGNALS}x the per-signal figures above.");
    println!("The planted overshoot is 96 V. A column reading 48 V lost it.");
}

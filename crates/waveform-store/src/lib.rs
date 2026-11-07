//! Reading a `.gsim_sim_result` and serving decimated windows of it.
//!
//! ## Why this is one crate used from two places
//!
//! A waveform viewer needs the same thing whether its samples are on the
//! machine or on a server: give me this window of these signals, in at most
//! this many points. Before this crate there were three implementations of
//! the reduction behind that question — two in Python (write-time pyramid
//! and query-time fallback) and one in TypeScript — so a trace could change
//! shape depending on which one produced it, and a difference between the
//! browser's view and the server's was indistinguishable from a bug in the
//! simulation.
//!
//! So: one implementation, compiled natively for the server and to
//! WebAssembly for the viewer. The viewer calls it directly on a local
//! file; a hosted deployment calls it on the server and ships only the
//! reduced window. Same code, same answer, and the only difference is where
//! the bytes were when the question was asked.
//!
//! ## What a "window at a budget" is worth
//!
//! A plot 1500 pixels wide can distinguish about 3000 points — two per
//! pixel, one for the top of each column and one for the bottom. Everything
//! beyond that is paid for and not seen. On a measured 11-signal,
//! 250,000-sample run that is 32 MB moved and held, against roughly 260 KB
//! for the same picture.

pub mod decimate;
pub mod manifest;
pub mod source;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub use manifest::{DataKind, Document};
pub use source::{Slice, WaveformSource};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The document is not readable as a result at all.
    Parse(String),
    /// The document is fine, but it does not carry what was asked for.
    Missing(String),
    /// The samples live somewhere this source cannot reach.
    External(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Parse(message) => write!(f, "{message}"),
            Error::Missing(message) => write!(f, "{message}"),
            Error::External(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

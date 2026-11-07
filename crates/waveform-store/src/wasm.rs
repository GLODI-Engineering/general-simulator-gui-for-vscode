//! The WebAssembly surface.
//!
//! The viewer holds one of these per open result and asks it for a window
//! whenever the view changes. The same crate, compiled natively, answers the
//! same question on a server — which is the point: the picture cannot differ
//! between the two, because the reduction is literally the same code.
//!
//! ## The shape of a slice crossing the boundary
//!
//! A slice comes back as one flat `Float64Array` laid out as
//! `[sweep…, signal0…, signal1…, …]`, not as an array of arrays. Each
//! JavaScript object created at the boundary costs a conversion, and a
//! 12-signal query would otherwise build 13 of them plus their contents on
//! every zoom. The caller knows how many signals it asked for, so it can
//! subarray the one buffer at no cost at all.

use js_sys::Float64Array;
use wasm_bindgen::prelude::*;

use crate::source::{InlineSource, WaveformSource};

#[wasm_bindgen]
pub struct WaveformStore {
    source: InlineSource,
}

#[wasm_bindgen]
impl WaveformStore {
    /// Read a `.gsim_sim_result` whose samples are inline.
    #[wasm_bindgen(constructor)]
    pub fn new(manifest_json: &str) -> Result<WaveformStore, JsError> {
        InlineSource::parse(manifest_json)
            .map(|source| WaveformStore { source })
            .map_err(|error| JsError::new(&error.to_string()))
    }

    /// The signals this result holds, as JSON: `[{name, unit, quantity, analysis}]`.
    ///
    /// JSON rather than a typed array of objects because it is read once per
    /// opened file, where a typed boundary would cost more in generated glue
    /// than it saves.
    #[wasm_bindgen(js_name = signalsJson)]
    pub fn signals_json(&self) -> String {
        let entries: Vec<String> = self
            .source
            .signals()
            .iter()
            .map(|signal| {
                format!(
                    r#"{{"name":{},"unit":{},"quantity":{},"analysis":{}}}"#,
                    json_string(&signal.name),
                    json_string(&signal.unit),
                    json_string(&signal.quantity),
                    json_string(&signal.analysis),
                )
            })
            .collect();
        format!("[{}]", entries.join(","))
    }

    #[wasm_bindgen(js_name = sweepDomain)]
    pub fn sweep_domain(&self) -> String {
        self.source.sweep_domain().to_string()
    }

    /// `[sweep…, signal0…, …]` for `names` over `[from, to]`, at most
    /// `max_points` samples each.
    ///
    /// Pass `from`/`to` as `undefined` for the whole extent.
    pub fn slice(
        &self,
        names: Vec<String>,
        from: Option<f64>,
        to: Option<f64>,
        max_points: usize,
    ) -> Result<Float64Array, JsError> {
        let window = match (from, to) {
            (Some(from), Some(to)) => Some((from, to)),
            _ => None,
        };
        let slice = self
            .source
            .slice(&names, window, max_points)
            .map_err(|error| JsError::new(&error.to_string()))?;

        let points = slice.sweep.len();
        let mut flat = Vec::with_capacity(points * (1 + slice.values.len()));
        flat.extend_from_slice(&slice.sweep);
        for column in &slice.values {
            flat.extend_from_slice(column);
        }
        Ok(Float64Array::from(&flat[..]))
    }
}

/// Minimal JSON string escaping, enough for signal names and units.
fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

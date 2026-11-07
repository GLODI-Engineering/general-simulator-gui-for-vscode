//! A source of samples, and the one that reads them from the document itself.

use base64::Engine as _;

use crate::decimate::{minmax_envelope, window_indices};
use crate::manifest::{DataKind, Document, Encoding, Vector};
use crate::{Error, Result};

/// One signal's identity, without its samples.
#[derive(Debug, Clone, PartialEq)]
pub struct SignalMeta {
    pub name: String,
    pub unit: String,
    pub quantity: String,
    pub analysis: String,
}

/// A window of several signals on one shared sweep axis.
///
/// One axis for all of them is not a convenience, it is the contract: a
/// chart draws every trace against a single x vector, so a source that
/// returned each signal on its own grid would have moved the problem rather
/// than solved it.
#[derive(Debug, Clone, PartialEq)]
pub struct Slice {
    pub sweep: Vec<f64>,
    /// Parallel to the names that were asked for, each the same length as `sweep`.
    pub values: Vec<Vec<f64>>,
}

pub trait WaveformSource {
    fn signals(&self) -> &[SignalMeta];
    fn sweep_domain(&self) -> &str;

    /// Up to `max_points` samples of each named signal over `[from, to]`.
    ///
    /// `None` for the window means the whole extent.
    fn slice(
        &self,
        names: &[String],
        window: Option<(f64, f64)>,
        max_points: usize,
    ) -> Result<Slice>;
}

fn decode(vector: &Vector) -> Result<Vec<f64>> {
    let data = vector
        .data
        .as_ref()
        .ok_or_else(|| Error::Missing(format!("\"{}\" carries no samples", vector.name)))?;

    match vector.encoding {
        Some(Encoding::Json) => {
            let array = data.as_array().ok_or_else(|| {
                Error::Parse(format!(
                    "\"{}\" declares encoding \"json\" but its data is not an array",
                    vector.name
                ))
            })?;
            array
                .iter()
                .map(|v| {
                    v.as_f64().ok_or_else(|| {
                        Error::Parse(format!("\"{}\" has a non-numeric sample", vector.name))
                    })
                })
                .collect()
        }
        Some(Encoding::F64Base64) => {
            let text = data.as_str().ok_or_else(|| {
                Error::Parse(format!(
                    "\"{}\" declares encoding \"f64-base64\" but its data is not a string",
                    vector.name
                ))
            })?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(text)
                .map_err(|_| {
                    Error::Parse(format!(
                        "\"{}\" has data that is not valid base64",
                        vector.name
                    ))
                })?;
            if bytes.len() % 8 != 0 {
                // Catch truncation here. Downstream it is invisible: a
                // signal one sample short is not an error to a chart, it
                // just plots every y against the wrong x.
                return Err(Error::Parse(format!(
                    "\"{}\" has {} bytes, which is not a whole number of doubles",
                    vector.name,
                    bytes.len()
                )));
            }
            Ok(bytes
                .as_chunks::<8>()
                .0
                .iter()
                .map(|chunk| f64::from_le_bytes(*chunk))
                .collect())
        }
        None => Err(Error::Missing(format!(
            "\"{}\" names no encoding, so its inline samples cannot be read",
            vector.name
        ))),
    }
}

/// A source backed by the samples carried in the document itself.
#[derive(Debug)]
pub struct InlineSource {
    sweep: Vec<f64>,
    sweep_domain: String,
    meta: Vec<SignalMeta>,
    values: Vec<Vec<f64>>,
}

impl InlineSource {
    pub fn from_document(doc: &Document) -> Result<Self> {
        if doc.kind() != DataKind::Inline {
            let path = doc
                .data
                .as_ref()
                .and_then(|d| d.path.clone())
                .unwrap_or_else(|| "another file".to_string());
            return Err(Error::External(format!(
                "this result keeps its samples in \"{path}\", not in the document"
            )));
        }

        let sweep = decode(&doc.sweep)?;
        let mut meta = Vec::with_capacity(doc.signals.len());
        let mut values = Vec::with_capacity(doc.signals.len());

        for signal in &doc.signals {
            let samples = decode(signal)?;
            if samples.len() != sweep.len() {
                return Err(Error::Parse(format!(
                    "signal \"{}\" has {} samples but the sweep has {}",
                    signal.name,
                    samples.len(),
                    sweep.len()
                )));
            }
            meta.push(SignalMeta {
                name: signal.name.clone(),
                unit: signal.unit.clone(),
                quantity: signal
                    .quantity
                    .clone()
                    .unwrap_or_else(|| "dimensionless".into()),
                analysis: signal.analysis.clone().unwrap_or_else(|| "tran".into()),
            });
            values.push(samples);
        }

        Ok(Self {
            sweep,
            sweep_domain: doc.sweep.domain.clone().unwrap_or_else(|| "time".into()),
            meta,
            values,
        })
    }

    pub fn parse(json: &str) -> Result<Self> {
        Self::from_document(&Document::parse(json)?)
    }

    fn index_of(&self, name: &str) -> Result<usize> {
        self.meta
            .iter()
            .position(|m| m.name == name)
            .ok_or_else(|| Error::Missing(format!("no signal named \"{name}\" in this result")))
    }
}

impl WaveformSource for InlineSource {
    fn signals(&self) -> &[SignalMeta] {
        &self.meta
    }

    fn sweep_domain(&self) -> &str {
        &self.sweep_domain
    }

    fn slice(
        &self,
        names: &[String],
        window: Option<(f64, f64)>,
        max_points: usize,
    ) -> Result<Slice> {
        let columns: Vec<usize> = names
            .iter()
            .map(|name| self.index_of(name))
            .collect::<Result<_>>()?;

        let (start, end) = match window {
            Some((from, to)) => window_indices(&self.sweep, from, to),
            None => (0, self.sweep.len().saturating_sub(1)),
        };
        if self.sweep.is_empty() {
            return Ok(Slice {
                sweep: Vec::new(),
                values: vec![Vec::new(); columns.len()],
            });
        }

        let window_time = &self.sweep[start..=end];
        let window_values: Vec<&[f64]> = columns
            .iter()
            .map(|&column| &self.values[column][start..=end])
            .collect();

        // The envelope, not plain time bucketing: both give one shared grid,
        // but only this one reports what each signal actually did inside a
        // bucket. On a 50-million-sample switching node, time bucketing
        // turns a 96 V overshoot into a 48 V peak — it keeps the first and
        // last sample of each bucket and never looks between them.
        let (sweep, values) = minmax_envelope(window_time, &window_values, max_points);
        Ok(Slice { sweep, values })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document(n: usize) -> String {
        let time: Vec<String> = (0..n).map(|i| (i as f64 * 1e-6).to_string()).collect();
        let values: Vec<String> = (0..n).map(|i| i.to_string()).collect();
        format!(
            r#"{{
              "schema_version": 2,
              "run": {{ "id": "r", "analysis": "TRAN" }},
              "data": {{ "kind": "inline" }},
              "sweep": {{ "name": "time", "unit": "s", "domain": "time",
                         "encoding": "json", "data": [{}] }},
              "signals": [
                {{ "name": "V(out)", "unit": "V", "quantity": "voltage",
                   "encoding": "json", "data": [{}] }}
              ]
            }}"#,
            time.join(","),
            values.join(",")
        )
    }

    #[test]
    fn reads_an_inline_result() {
        let source = InlineSource::parse(&document(10)).expect("parses");
        assert_eq!(source.signals().len(), 1);
        assert_eq!(source.signals()[0].unit, "V");
        assert_eq!(source.sweep_domain(), "time");
    }

    #[test]
    fn reads_a_v1_document_which_had_no_data_block() {
        let json = document(5)
            .replace("\"schema_version\": 2", "\"schema_version\": 1")
            .replace("\"data\": { \"kind\": \"inline\" },", "");
        let source = InlineSource::parse(&json).expect("v1 still parses");
        assert_eq!(source.signals().len(), 1);
    }

    #[test]
    fn serves_the_whole_extent_when_no_window_is_given() {
        let source = InlineSource::parse(&document(100)).unwrap();
        let slice = source.slice(&["V(out)".into()], None, 1000).unwrap();
        assert_eq!(slice.sweep.len(), 100);
        assert_eq!(slice.values[0].len(), 100);
    }

    #[test]
    fn serves_only_the_window_asked_for() {
        let source = InlineSource::parse(&document(1000)).unwrap();
        let slice = source
            .slice(&["V(out)".into()], Some((10e-6, 20e-6)), 1000)
            .unwrap();
        // ~11 samples plus one bracketing each side, and every one of them.
        assert!(slice.sweep.len() >= 11 && slice.sweep.len() <= 14);
        assert!(slice.sweep[0] <= 10e-6);
        assert!(*slice.sweep.last().unwrap() >= 20e-6);
    }

    #[test]
    fn honours_the_point_budget() {
        let source = InlineSource::parse(&document(10_000)).unwrap();
        let slice = source.slice(&["V(out)".into()], None, 200).unwrap();
        assert!(slice.sweep.len() <= 200, "got {}", slice.sweep.len());
        assert_eq!(slice.values[0].len(), slice.sweep.len());
    }

    #[test]
    fn a_spike_survives_the_budget() {
        // The property the whole reduction exists to have. One sample of
        // overshoot in a 20,000-sample run, reduced to 200 points.
        let n = 20_000;
        let spike = n * 3 / 4 + 237;
        let time: Vec<String> = (0..n).map(|i| (i as f64 * 1e-8).to_string()).collect();
        let values: Vec<String> = (0..n)
            .map(|i| {
                if i == spike {
                    "96".to_string()
                } else {
                    "48".to_string()
                }
            })
            .collect();
        let json = format!(
            r#"{{
              "schema_version": 2,
              "run": {{ "id": "r", "analysis": "TRAN" }},
              "data": {{ "kind": "inline" }},
              "sweep": {{ "name": "time", "unit": "s", "encoding": "json", "data": [{}] }},
              "signals": [{{ "name": "V(sw)", "unit": "V", "encoding": "json", "data": [{}] }}]
            }}"#,
            time.join(","),
            values.join(",")
        );
        let source = InlineSource::parse(&json).unwrap();
        let slice = source.slice(&["V(sw)".into()], None, 200).unwrap();
        let peak = slice.values[0].iter().copied().fold(f64::MIN, f64::max);
        assert_eq!(peak, 96.0, "the overshoot was decimated away");
    }

    #[test]
    fn says_which_signal_is_missing() {
        let source = InlineSource::parse(&document(10)).unwrap();
        let error = source.slice(&["I(L1)".into()], None, 100).unwrap_err();
        assert!(format!("{error}").contains("I(L1)"), "{error}");
    }

    #[test]
    fn refuses_a_document_whose_samples_live_elsewhere() {
        let json = r#"{
          "schema_version": 2,
          "run": { "id": "r", "analysis": "TRAN" },
          "data": { "kind": "hdf5", "path": "run-17.h5" },
          "sweep": { "name": "time", "unit": "s", "dataset": "time" },
          "signals": [{ "name": "V(out)", "unit": "V", "dataset": "b__out" }]
        }"#;
        let error = InlineSource::parse(json).unwrap_err();
        assert!(format!("{error}").contains("run-17.h5"), "{error}");
    }

    #[test]
    fn rejects_a_signal_whose_length_disagrees_with_the_sweep() {
        // The one cross-field invariant a schema cannot state, and the one
        // whose breach is invisible on a chart.
        let json = document(10).replace(r#""data": [0,1,2,3,4,5,6,7,8,9]"#, r#""data": [0,1,2]"#);
        let error = InlineSource::parse(&json).unwrap_err();
        assert!(
            format!("{error}").contains("3 samples but the sweep has 10"),
            "{error}"
        );
    }

    #[test]
    fn round_trips_base64_doubles_exactly() {
        use base64::Engine as _;
        let values: Vec<f64> = vec![0.1, 1.0 / 3.0, -0.0, f64::MIN_POSITIVE, 1e300];
        let bytes: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let json = format!(
            r#"{{
              "schema_version": 2,
              "run": {{ "id": "r", "analysis": "TRAN" }},
              "data": {{ "kind": "inline" }},
              "sweep": {{ "name": "time", "unit": "s", "encoding": "f64-base64", "data": "{encoded}" }},
              "signals": [{{ "name": "v", "unit": "V", "encoding": "f64-base64", "data": "{encoded}" }}]
            }}"#
        );
        let source = InlineSource::parse(&json).unwrap();
        let slice = source.slice(&["v".into()], None, 1000).unwrap();
        assert_eq!(slice.values[0], values);
    }
}

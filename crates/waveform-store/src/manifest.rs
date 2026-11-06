//! The `.gsim_sim_result` document, as Rust sees it.
//!
//! Mirrors `packages/schemas/definitions/results/gsim_sim_result.schema.json`,
//! which stays the source of truth. Only what a reader needs is modelled —
//! unknown fields are ignored rather than rejected, so a newer writer adding
//! a field does not break an older reader.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Run {
    pub id: String,
    pub analysis: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub created: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataKind {
    Inline,
    Hdf5,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DataLocation {
    pub kind: DataKind,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum Encoding {
    #[serde(rename = "f64-base64")]
    F64Base64,
    #[serde(rename = "json")]
    Json,
}

/// One sampled vector: the sweep axis, or a signal.
#[derive(Debug, Clone, Deserialize)]
pub struct Vector {
    pub name: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub quantity: Option<String>,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub analysis: Option<String>,
    #[serde(default)]
    pub encoding: Option<Encoding>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub dataset: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Document {
    pub schema_version: u32,
    pub run: Run,
    /// Absent in a v1 document, where the samples were always inline.
    #[serde(default)]
    pub data: Option<DataLocation>,
    pub sweep: Vector,
    pub signals: Vec<Vector>,
}

impl Document {
    pub fn parse(json: &str) -> Result<Self, crate::Error> {
        let doc: Document =
            serde_json::from_str(json).map_err(|e| crate::Error::Parse(e.to_string()))?;
        if doc.schema_version != 1 && doc.schema_version != 2 {
            return Err(crate::Error::Parse(format!(
                "schema_version {} is not one this reader knows (1 or 2)",
                doc.schema_version
            )));
        }
        Ok(doc)
    }

    /// Where the samples are. A v1 document had no `data` block because
    /// there was only one possibility.
    pub fn kind(&self) -> DataKind {
        self.data.as_ref().map(|d| d.kind).unwrap_or(DataKind::Inline)
    }
}

# Model Schemas

`packages/schemas/definitions/model/` owns the persisted frontend model contract.

## Files

- `gsim_sch.schema.json`: top-level `.gsim_sch` v2 document schema.
- `port-kind.schema.json`: shared v2 port-kind sub-schema used by block metadata and canvas compatibility checks.

## `.gsim_sch` Contract

The persisted file format is:

```json
{
  "schema_version": 2,
  "model": {
    "id": "model-id",
    "name": "Example model",
    "grid": 10,
    "params": [],
    "blocks": [],
    "wires": [],
    "lines": [],
    "nets": [],
    "simulation": {},
    "metadata": {}
  }
}
```

Rules:

- Coordinates are integer-only.
- `rotation` is one of `0 | 90 | 180 | 270`.
- `mirror` is one of `none | x | y`.
- `blocks`, `wires`, `lines`, `nets`, and `simulation` are the canonical saved model.
- Every block stores `paradigm`, `domain`, `fidelity`, and `ic` explicitly.
- Every wire stores `kind` and `net` explicitly.
- Writers must emit canonical key ordering so save/load round-trips are byte-stable.

The frontend and backend should treat these schemas as the single source of truth for persisted model structure.

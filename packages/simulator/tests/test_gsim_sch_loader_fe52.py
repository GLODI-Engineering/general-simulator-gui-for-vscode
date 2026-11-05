"""FE-52 — loader roundtrip + schema enforcement tests."""

from __future__ import annotations

import copy
import json

import pytest

from simulator.compiler.gsim_sch_loader import GsimSchValidationError, load
from simulator.compiler.gsim_sch_writer import write

RC_LOW_PASS_CANONICAL = """{
  "schema_version": 2,
  "model": {
    "id": "rc-low-pass",
    "name": "RC Low-Pass",
    "grid": 10,
    "params": [
      {
        "name": "Rload",
        "value": 1000
      },
      {
        "name": "Cload",
        "value": "{1e-6}"
      }
    ],
    "blocks": [
      {
        "id": "vin",
        "type": "physical-electrical.source.voltage_dc",
        "paradigm": "physical-network",
        "domain": "physical-electrical",
        "fidelity": "ideal",
        "position": [
          40,
          40
        ],
        "rotation": 0,
        "mirror": "none",
        "params": {
          "V": 1
        },
        "ic": {},
        "label": "Vin"
      },
      {
        "id": "r1",
        "type": "physical-electrical.passive.resistor",
        "paradigm": "physical-network",
        "domain": "physical-electrical",
        "fidelity": "ideal",
        "position": [
          120,
          40
        ],
        "rotation": 0,
        "mirror": "none",
        "params": {
          "R": "Rload"
        },
        "ic": {},
        "label": "R1"
      },
      {
        "id": "c1",
        "type": "physical-electrical.passive.capacitor",
        "paradigm": "physical-network",
        "domain": "physical-electrical",
        "fidelity": "ideal",
        "position": [
          220,
          40
        ],
        "rotation": 0,
        "mirror": "none",
        "params": {
          "C": "Cload"
        },
        "ic": {},
        "label": "C1"
      }
    ],
    "wires": [
      {
        "id": "w1",
        "from": {
          "block": "vin",
          "port": "p"
        },
        "to": {
          "block": "r1",
          "port": "p"
        },
        "waypoints": [],
        "pinned": false,
        "net": "VIN",
        "kind": "physical-electrical",
        "label": null
      },
      {
        "id": "w2",
        "from": {
          "block": "r1",
          "port": "n"
        },
        "to": {
          "block": "c1",
          "port": "p"
        },
        "waypoints": [],
        "pinned": false,
        "net": "VOUT",
        "kind": "physical-electrical",
        "label": null
      }
    ],
    "lines": [],
    "nets": [
      {
        "name": "VIN",
        "kind": "physical-electrical",
        "scope": "local"
      },
      {
        "name": "VOUT",
        "kind": "physical-electrical",
        "scope": "local"
      },
      {
        "name": "GND",
        "kind": "physical-electrical",
        "scope": "global",
        "is_reference": true
      }
    ],
    "simulation": {},
    "metadata": {}
  }
}
"""


NESTED_SUBSYSTEM_DEPTH2_CANONICAL = """{
  "schema_version": 2,
  "model": {
    "id": "depth2-root",
    "name": "Depth-2 Subsystem",
    "grid": 10,
    "params": [],
    "blocks": [
      {
        "id": "sub1",
        "type": "hierarchy.subsystem.virtual",
        "paradigm": "hierarchy",
        "domain": "signal",
        "fidelity": "n_a",
        "position": [
          100,
          100
        ],
        "rotation": 0,
        "mirror": "none",
        "params": {},
        "ic": {},
        "subsystem": {
          "id": "submodel-1",
          "name": "Submodel 1",
          "grid": 10,
          "params": [],
          "blocks": [
            {
              "id": "sub2",
              "type": "hierarchy.subsystem.virtual",
              "paradigm": "hierarchy",
              "domain": "signal",
              "fidelity": "n_a",
              "position": [
                20,
                20
              ],
              "rotation": 0,
              "mirror": "none",
              "params": {},
              "ic": {},
              "subsystem": {
                "id": "submodel-2",
                "name": "Submodel 2",
                "grid": 10,
                "params": [],
                "blocks": [
                  {
                    "id": "gain1",
                    "type": "signal-flow.math.gain",
                    "paradigm": "signal-flow",
                    "domain": "signal",
                    "fidelity": "ideal",
                    "position": [
                      10,
                      10
                    ],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {
                      "K": 2
                    },
                    "ic": {}
                  }
                ],
                "wires": [],
                "lines": [],
                "nets": [],
                "simulation": {},
                "metadata": {}
              }
            }
          ],
          "wires": [],
          "lines": [],
          "nets": [],
          "simulation": {},
          "metadata": {}
        }
      }
    ],
    "wires": [],
    "lines": [],
    "nets": [],
    "simulation": {},
    "metadata": {}
  }
}
"""


def _minimal_valid_doc() -> dict[str, object]:
    return {
        "schema_version": 2,
        "model": {
            "id": "m1",
            "name": "Minimal",
            "grid": 10,
            "params": [],
            "blocks": [
                {
                    "id": "b1",
                    "type": "signal-flow.math.gain",
                    "paradigm": "signal-flow",
                    "domain": "signal",
                    "fidelity": "ideal",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"K": 1},
                    "ic": {},
                }
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "b1", "port": "out"},
                    "to": {"block": "b1", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                    "net": None,
                    "kind": "signal",
                }
            ],
            "lines": [],
            "nets": [],
            "simulation": {},
            "metadata": {},
        },
    }


def test_loader_roundtrip_rc_low_pass_byte_exact() -> None:
    doc = load(RC_LOW_PASS_CANONICAL)
    assert write(doc) == RC_LOW_PASS_CANONICAL


def test_loader_roundtrip_nested_subsystem_depth2_byte_exact() -> None:
    doc = load(NESTED_SUBSYSTEM_DEPTH2_CANONICAL)
    assert write(doc) == NESTED_SUBSYSTEM_DEPTH2_CANONICAL


def test_loader_rejects_v1() -> None:
    bad = _minimal_valid_doc()
    bad["schema_version"] = 1

    with pytest.raises(GsimSchValidationError, match="Unsupported gsim_sch schema_version"):
        load(bad)


@pytest.mark.parametrize(
    ("mutator", "key_name"),
    [
        (lambda d: d["model"].update({"unexpected": True}), "unexpected"),
        (lambda d: d["model"]["blocks"][0].update({"extra_block_key": 1}), "extra_block_key"),
        (lambda d: d["model"]["wires"][0].update({"extra_wire_key": 1}), "extra_wire_key"),
    ],
    ids=["model", "block", "wire"],
)
def test_loader_rejects_unknown_keys(mutator, key_name: str) -> None:
    bad = copy.deepcopy(_minimal_valid_doc())
    mutator(bad)

    with pytest.raises(GsimSchValidationError) as excinfo:
        load(bad)

    msg = str(excinfo.value)
    assert "Additional properties are not allowed" in msg
    assert key_name in msg


def test_loader_defaults_role_to_schematic_when_absent() -> None:
    """Every pre-`role` .gsim_sch file must keep loading and read as a schematic."""
    doc = load(_minimal_valid_doc())

    assert "role" not in doc.model
    assert doc.role == "schematic"


def test_loader_accepts_library_role() -> None:
    doc = copy.deepcopy(_minimal_valid_doc())
    doc["model"]["role"] = "library"

    loaded = load(doc)

    assert loaded.role == "library"
    assert loaded.model["role"] == "library"


def test_loader_rejects_invalid_role() -> None:
    bad = copy.deepcopy(_minimal_valid_doc())
    bad["model"]["role"] = "gallery"

    with pytest.raises(GsimSchValidationError, match="Invalid model role"):
        load(bad)


def test_writer_places_role_after_name_and_omits_it_when_absent() -> None:
    """§17.4: `role` sits between `name` and `grid`, and is never materialised."""
    with_role = copy.deepcopy(_minimal_valid_doc())
    with_role["model"]["role"] = "library"

    keys = list(json.loads(write(load(with_role)))["model"].keys())
    assert keys[:4] == ["id", "name", "role", "grid"]

    without_role = json.loads(write(load(_minimal_valid_doc())))["model"]
    assert "role" not in without_role


def test_roundtrip_preserves_library_role_byte_exactly() -> None:
    text = write(load(RC_LOW_PASS_CANONICAL)).replace(
        '"name": "RC Low-Pass",', '"name": "RC Low-Pass",\n    "role": "library",'
    )

    assert write(load(text)) == text


def test_loader_rejects_role_on_nested_subsystem() -> None:
    """`role` is a top-level-only field (§4.1); the schema rejects it in a subsystem."""
    bad = copy.deepcopy(NESTED_SUBSYSTEM_DEPTH2_CANONICAL)
    doc = json.loads(bad)
    subsystem = next(b for b in doc["model"]["blocks"] if "subsystem" in b)["subsystem"]
    subsystem["role"] = "library"

    with pytest.raises(GsimSchValidationError) as excinfo:
        load(doc)

    assert "Additional properties are not allowed" in str(excinfo.value)
    assert "role" in str(excinfo.value)


def test_loader_accepts_boolean_block_params() -> None:
    """FE-138 regression: several blocks (from_workspace, bjt_npn, bjt_pnp,
    pid — see packages/blocks/.../metadata.yaml `type: bool` params) declare
    boolean params, but ParamValue in gsim_sch.schema.json only allowed
    number/string until this fix, so any saved file containing one of these
    blocks could never be reopened.
    """
    doc = copy.deepcopy(_minimal_valid_doc())
    doc["model"]["blocks"][0]["params"] = {"K": 1, "enabled": True}

    loaded = load(doc)
    assert loaded.model["blocks"][0]["params"]["enabled"] is True

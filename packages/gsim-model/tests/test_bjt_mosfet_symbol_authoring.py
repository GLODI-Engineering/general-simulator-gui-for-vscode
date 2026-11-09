"""Transistor catalog metadata — what is still worth asserting about it.

This file used to assert that `bjt_npn`/`mosfet_n` metadata carried
`symbol.shape: primitives` with inline artwork, and pinned their port offsets
at 41/46/81/51. Both halves are superseded, by two deliberate commits:

* `835e34c` moved artwork out of metadata entirely. A drawing is now one file
  under `apps/frontend/src/canvas/nodes/symbols/` named in `symbols/registry.ts`,
  and metadata carries `shape: rect` with no drawing at all. That side's own
  test — `apps/frontend/src/canvas/nodes/bjt-mosfet-symbol-parity.test.ts` —
  was rewritten at the time to assert the thing that matters there: that these
  types resolve to artwork rather than falling through to a white box. It is
  not duplicated here.
* `2135b2a` moved transistor pins onto the 20-unit grid (60x60 boxes, offsets
  at 30) because at 41/51/81 no wire could reach them orthogonally without an
  off-grid jog.

So the old assertions did not catch a regression; they *were* the stale side.
The replacement asserts the invariant rather than the numbers — a magic-number
pin is what let this rot unnoticed in the first place — and the generator that
produced those numbers has been retired (see `packages/gsim-model/scripts/README-retired.md`),
because running it would have reverted both commits above.
"""

from __future__ import annotations

import json
import pathlib

import pytest
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_BLOCKS_ROOT = _REPO_ROOT / "packages" / "blocks" / "src" / "blocks"
_SCHEMAS_DIR = _REPO_ROOT / "packages" / "schemas" / "definitions"

_TRANSISTORS = [
    "bjt_npn",
    "bjt_pnp",
    "mosfet_n",
    "mosfet_p",
]


def _validator() -> Draft202012Validator:
    block_schema = json.loads((_SCHEMAS_DIR / "blocks" / "block-metadata.schema.json").read_text())
    port_kind_schema = json.loads((_SCHEMAS_DIR / "model" / "port-kind.schema.json").read_text())
    registry = Registry().with_resource(
        "https://general-simulator.dev/schemas/model/port-kind.schema.json",
        Resource.from_contents(port_kind_schema),
    )
    return Draft202012Validator(block_schema, registry=registry)


def _metadata(name: str) -> dict:  # type: ignore[type-arg]
    path = _BLOCKS_ROOT / "physical-electrical" / "semiconductor" / name / "metadata.yaml"
    return yaml.safe_load(path.read_text())  # type: ignore[no-any-return]


def _all_ports(data: dict) -> list[dict]:  # type: ignore[type-arg]
    ports = data["ports"]
    return [*ports.get("inputs", []), *ports.get("outputs", [])]


@pytest.mark.parametrize("name", _TRANSISTORS)
def test_transistor_metadata_validates(name: str) -> None:
    errors = list(_validator().iter_errors(_metadata(name)))
    assert errors == [], [e.message for e in errors]


@pytest.mark.parametrize("name", _TRANSISTORS)
def test_transistor_pins_sit_at_their_edge_midpoint(name: str) -> None:
    """Each pin sits at the centre of the edge it is on (`2135b2a`).

    Measured, not assumed: of the 629 catalog ports that declare both an offset
    and a bbox, 440 sit at their edge's midpoint, and that is the convention the
    two-terminal parts a transistor stands beside follow — a resistor is 60x40
    with its pins at 20, a transistor 60x60 with its pins at 30. (The commit
    that moved them described this as putting them "on the 20-unit grid", which
    30 is not; the midpoint is what it actually achieved, and the midpoint is
    what keeps a symbol symmetric.)

    Asserted as the invariant, not as the numbers that satisfy it today: resizing
    a symbol is a legitimate change, hanging a pin off-centre is not. A
    magic-number pin is exactly what let this file rot unnoticed.
    """
    data = _metadata(name)
    width, height = data["symbol"]["bbox"]
    wrong = {}
    for port in _all_ports(data):
        extent = height if port["side"] in ("left", "right") else width
        if port["offset"] * 2 != extent:
            wrong[port["id"]] = (port["side"], port["offset"], extent / 2)
    assert wrong == {}, (
        f"{name}: pins not centred on their edge (id -> side, offset, expected): {wrong}"
    )


@pytest.mark.parametrize("name", _TRANSISTORS)
def test_transistor_metadata_carries_no_artwork(name: str) -> None:
    """Artwork lives in one place only (`835e34c`).

    Two descriptions of one drawing is exactly how they drift apart — the inline
    primitives were authored for an 80x110 box and would overflow the 60x60 one
    the symbols were redrawn to. The drawing belongs to `symbols/registry.ts`,
    and this asserts metadata is not quietly growing a second copy.
    """
    symbol = _metadata(name)["symbol"]
    assert symbol.get("shape") != "primitives", (
        f"{name}: metadata declares inline artwork again — a drawing belongs in "
        "apps/frontend/src/canvas/nodes/symbols/, named in symbols/registry.ts"
    )
    assert "primitives" not in symbol, f"{name}: metadata carries inline primitives again"

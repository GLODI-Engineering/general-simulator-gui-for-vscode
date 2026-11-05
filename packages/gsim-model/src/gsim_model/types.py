"""Scalar / enum types shared by the .gsim_sch v2 model classes."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

PortKind = Literal[
    "signal",
    "signal-bus",
    "function-call",
    "physical-electrical",
    "physical-translational",
    "physical-rotational",
    "physical-thermal",
    "physical-signal",
    "mixed",
    "reserved.physical-magnetic",
    "reserved.physical-hydraulic",
    "reserved.physical-fluid",
]

Fidelity = Literal["ideal", "behavioral", "spice", "n_a"]

Paradigm = Literal[
    "signal-flow",
    "physical-network",
    "converter",
    "hierarchy",
    "routing",
    "annotation",
    "spice-subckt",
]

Rotation = Literal[0, 90, 180, 270]

Mirror = Literal["none", "x", "y"]

# A param value per the schema: JSON number, boolean, expression string
# (``{...}``), or a bare identifier referencing another param by name.
ParamValue = float | bool | str


class ParamEntry(BaseModel):
    name: str
    value: ParamValue
    unit: str | None = None
    doc: str | None = None

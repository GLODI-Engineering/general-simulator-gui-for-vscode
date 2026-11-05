"""Endpoint / Wire — connectivity primitives for .gsim_sch v2."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from gsim_model.types import PortKind


class Endpoint(BaseModel):
    """A (block, port) pair — one side of a Wire, or a query target."""

    model_config = ConfigDict(frozen=True)

    block: str
    port: str

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return f"{self.block}:{self.port}"


class Wire(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    from_: Endpoint = Field(alias="from")
    to: Endpoint
    waypoints: list[tuple[int, int]] = Field(default_factory=list)
    pinned: bool = False
    net: str | None = None
    kind: PortKind
    label: str | None = None

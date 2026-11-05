"""State vector layout helpers for the scipy compiler (BE-14)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np


@dataclass
class ObservationHook:
    """Records output values for a sink block at each solver step."""

    block_id: str
    port_id: str
    values: list[float] = field(default_factory=list)
    times: list[float] = field(default_factory=list)


@dataclass
class CompiledModel:
    """Produced by scipy_compiler.compile(); consumed by the solver."""

    f: Callable[[float, np.ndarray], np.ndarray]
    x0: np.ndarray
    state_layout: dict[tuple[str, str], int]  # (block_id, var) -> index
    observation_hooks: list[ObservationHook]
    n_states: int
    # Human-readable signal names: (block_id, port_id) -> display name
    signal_names: dict[tuple[str, str], str] = field(default_factory=dict)

    @property
    def observations(self) -> dict[str, float]:
        """Return last observed value for each hook, keyed by block_id and block_id__port_id."""
        result: dict[str, float] = {}
        for hook in self.observation_hooks:
            if hook.values:
                last = hook.values[-1]
                result[hook.block_id] = last
                result[f"{hook.block_id}__{hook.port_id}"] = last
        return result

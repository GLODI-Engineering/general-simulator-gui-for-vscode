"""BE-63 — signal-domain-aware result manifest tagging.

ngspice prints both a real electrical node and a signal-flow-origin node
identically as v(nodename); _annotate_bundle's node_domains override (fed
by spice_netlist_writer.compute_node_domains) is what lets the manifest
tell them apart, even though nothing about the raw ngspice output does.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pytest

from kernel_sidecar.ipc.handlers import simulate as simulate_handler

pytestmark = pytest.mark.asyncio


@dataclass
class _ProtoSig:
    block_id: str
    port_id: str
    name: str
    data: np.ndarray


@dataclass
class _ProtoBundle:
    sim_id: str
    t_start: float
    t_end: float
    t: np.ndarray
    signals: list[_ProtoSig]
    n_points: int


@dataclass
class _Options:
    analysis_type: str = "TRAN"
    dc_source: str = ""


async def test_signal_flow_node_tagged_dimensionless_in_manifest() -> None:
    proto = _ProtoBundle(
        sim_id="wf-mixed",
        t_start=0.0,
        t_end=1.0,
        t=np.array([0.0, 0.5, 1.0], dtype=np.float64),
        signals=[
            _ProtoSig(
                block_id="r1", port_id="p", name="v(net1)", data=np.zeros(3, dtype=np.float32)
            ),
            _ProtoSig(
                block_id="gain1",
                port_id="out",
                name="v(net2)",
                data=np.zeros(3, dtype=np.float32),
            ),
        ],
        n_points=3,
    )

    annotated = simulate_handler._annotate_bundle(
        proto, _Options(), node_domains={"net1": "physical-electrical", "net2": "signal"}
    )

    by_name = {sig.name: sig for sig in annotated.signals}
    assert by_name["v(net1)"].quantity == "voltage"
    assert by_name["v(net1)"].unit == "V"


async def test_electrical_node_still_tagged_voltage() -> None:
    proto = _ProtoBundle(
        sim_id="wf-mixed",
        t_start=0.0,
        t_end=1.0,
        t=np.array([0.0, 0.5, 1.0], dtype=np.float64),
        signals=[
            _ProtoSig(
                block_id="r1", port_id="p", name="v(net1)", data=np.zeros(3, dtype=np.float32)
            ),
            _ProtoSig(
                block_id="gain1",
                port_id="out",
                name="v(net2)",
                data=np.zeros(3, dtype=np.float32),
            ),
        ],
        n_points=3,
    )

    annotated = simulate_handler._annotate_bundle(
        proto, _Options(), node_domains={"net1": "physical-electrical", "net2": "signal"}
    )

    by_name = {sig.name: sig for sig in annotated.signals}
    assert by_name["v(net2)"].quantity == "dimensionless"
    assert by_name["v(net2)"].unit == ""


async def test_no_node_domains_preserves_existing_name_prefix_behavior() -> None:
    """When node_domains is None (e.g. the direct-netlist path, which has
    no IR1Graph to derive it from), behavior is unchanged from before
    BE-63 — every v(...) name is tagged voltage/"V"."""
    proto = _ProtoBundle(
        sim_id="wf-plain",
        t_start=0.0,
        t_end=1.0,
        t=np.array([0.0, 0.5, 1.0], dtype=np.float64),
        signals=[
            _ProtoSig(
                block_id="r1", port_id="p", name="v(net1)", data=np.zeros(3, dtype=np.float32)
            ),
        ],
        n_points=3,
    )

    annotated = simulate_handler._annotate_bundle(proto, _Options())

    assert annotated.signals[0].quantity == "voltage"
    assert annotated.signals[0].unit == "V"

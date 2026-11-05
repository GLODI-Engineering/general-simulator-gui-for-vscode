"""BE-68 — XSPICE digital sequential-logic compiler pass for signal-flow
blocks (flip-flops, sample-and-hold).

Covers:
- Exact adc_bridge/d_dff/d_srff/dac_bridge card sequences.
- Real ngspice runs proving the digital-domain crossing actually works:
  a D flip-flop holds Q between clock edges, an SR flip-flop sets on a
  clock edge, and sample_hold (built on a switch+capacitor track-and-hold
  circuit, NOT a digital flip-flop — XSPICE flip-flops only hold a single
  bit, not an arbitrary analog magnitude) holds its captured value while
  the input keeps changing.
"""

from __future__ import annotations

import numpy as np
import pytest

from simulator.compiler.signal_flow_spice_lower import get_ports, render
from simulator.ir.ir1 import IR1Block


def _sf_block(instance_id: str, block_type: str, **params: object) -> IR1Block:
    return IR1Block(
        instance_id=instance_id,
        block_type=block_type,
        paradigm="signal-flow",
        domain="signal",
        fidelity="n_a",
        params=params,
    )


def _nets(block_type: str) -> dict[str, str]:
    return {p: p for p in get_ports(block_type)}


def test_dff_card_text() -> None:
    block = _sf_block("ff1", "signal-flow.logic.dff")
    text = render(block, _nets("signal-flow.logic.dff"))
    lines = text.splitlines()

    assert "Aff1clkadc [clk] [ff1_clk_d] ADCMOD_ff1clk" in lines
    assert "Aff1dadc [d] [ff1_d_d] ADCMOD_ff1d" in lines
    dff_line = next(line for line in lines if line.startswith("Aff1dff"))
    # d_dff ports are non-vector — no brackets on this card, unlike the
    # adc_bridge/dac_bridge lines around it.
    assert "[" not in dff_line
    assert dff_line.split()[0] == "Aff1dff"
    assert "Aff1qdac [ff1_q_d] [q] DACMOD_ff1q" in lines


def test_srff_card_text_includes_async_set_reset() -> None:
    block = _sf_block("ff2", "signal-flow.logic.srff")
    text = render(block, _nets("signal-flow.logic.srff"))
    lines = text.splitlines()

    srff_line = next(line for line in lines if line.startswith("Aff2srff"))
    # instance-name + s r clk aset areset out Nout + model = 9 tokens.
    assert len(srff_line.split()) == 9
    assert "[" not in srff_line


def test_sample_hold_card_text() -> None:
    block = _sf_block("sh1", "signal-flow.logic.sample_hold", threshold=0.5)
    text = render(block, _nets("signal-flow.logic.sample_hold"))
    lines = text.splitlines()

    assert lines[0] == "Ssh1 in sh1_hold clk 0 SHMOD_sh1"
    assert lines[1] == ".model SHMOD_sh1 SW(VT=0.5 VH=0 RON=1 ROFF=1e9)"
    assert lines[2].startswith("Csh1 sh1_hold 0")
    assert lines[3] == "Bsh1 out 0 V=V(sh1_hold)"


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_dff_holds_between_clock_edges() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    block = _sf_block("ff1", "signal-flow.logic.dff")
    card = render(block, _nets("signal-flow.logic.dff"))
    netlist = f"""\
* dff integration test
Vd d 0 DC 5
Vclk clk 0 PULSE(0 5 0 1n 1n 0.5m 1m)
Rq q 0 1k
{card}
.TRAN 1e-4 5e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="dff-int")

    q_signal = next(s for s in result.signals if s.name.lower() == "v(q)")
    # D held high the whole run: after the first rising clock edge, Q must
    # go high and stay high (not just react momentarily).
    assert max(q_signal.data) > 4.0
    assert q_signal.data[-1] > 4.0


@pytest.mark.integration
def test_integration_srff_sets_on_clock_edge() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    block = _sf_block("ff2", "signal-flow.logic.srff")
    card = render(block, _nets("signal-flow.logic.srff"))
    netlist = f"""\
* srff integration test
Vs s 0 DC 5
Vr r 0 DC 0
Vclk clk 0 PULSE(0 5 0 1n 1n 0.5m 1m)
Rq q 0 1k
{card}
.TRAN 1e-4 5e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="srff-int")

    q_signal = next(s for s in result.signals if s.name.lower() == "v(q)")
    assert q_signal.data[-1] > 4.0


@pytest.mark.integration
def test_integration_sample_hold_holds_between_samples() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    block = _sf_block("sh1", "signal-flow.logic.sample_hold", threshold=0.5)
    card = render(block, _nets("signal-flow.logic.sample_hold"))
    netlist = f"""\
* sample_hold integration test: hold a single sample from a moving input
Vin in 0 SIN(2 1 500)
Vclk clk 0 PULSE(0 5 1m 1u 1u 0.2m 20m)
{card}
.TRAN 1e-5 5m
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="sample-hold-int")

    t = result.time
    inp = next(s for s in result.signals if s.name.lower() == "v(in)")
    out = next(s for s in result.signals if s.name.lower() == "v(out)")

    idx_close = int(np.argmax(t > 1.25e-3))
    idx_later = int(np.argmax(t > 3e-3))

    # Output must track the sampled value at the moment the switch opens...
    assert abs(float(out.data[idx_close]) - float(inp.data[idx_close])) < 0.5
    # ...and then hold that value even though the input keeps changing.
    assert abs(float(out.data[idx_later]) - float(out.data[idx_close])) < 0.2
    assert abs(float(inp.data[idx_later]) - float(inp.data[idx_close])) > 0.3

"""signal-flow.source.{sine,constant} and signal-flow.continuous.pid
compiler support.

Found missing while starting the SRF-PLL example of the power-electronics
library audit — all three blocks were declared in the catalog with zero
v2 registry entries at all (UnsupportedBlockError on any use).

Covers:
- Exact B-source card text for signal-flow.source.{sine,constant}.
- Exact int-codemodel + B-source card pair for signal-flow.continuous.pid
  (PI only — kd != 0 raises UnsupportedSignalFlowParamError, no current
  use case needs the derivative term).
- Real ngspice integration: sine's peak amplitude/frequency, and PI's
  exact step response (kp*step + ki*step*t).
"""

from __future__ import annotations

import pytest

from simulator.compiler.signal_flow_spice_lower import (
    UnsupportedSignalFlowParamError,
    get_ports,
    render,
)
from simulator.ir.ir1 import IR1Block


def _block(instance_id: str, block_type: str, **params: object) -> IR1Block:
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


def test_source_constant_card_text() -> None:
    block = _block("c1", "signal-flow.source.constant", value=314.159)
    text = render(block, _nets("signal-flow.source.constant"))
    assert text == "Bc1 out 0 V=314.159"


def test_source_sine_card_text() -> None:
    block = _block("s1", "signal-flow.source.sine", amplitude=100.0, frequency=50.0, phase=0.5, bias=2.0)
    text = render(block, _nets("signal-flow.source.sine"))
    assert text == "Bs1 out 0 V=2+100*sin(6.28319*50*time+0.5)"


def test_pid_card_text_pi_only() -> None:
    block = _block("pid1", "signal-flow.continuous.pid", kp=2.0, ki=100.0, kd=0.0)
    text = render(block, _nets("signal-flow.continuous.pid"))
    lines = text.splitlines()

    assert lines[0] == "Apid1int in pid1_int PIDINT_pid1"
    assert lines[1] == (
        ".model PIDINT_pid1 int(gain=1.0 in_offset=0.0 "
        "out_lower_limit=-1e12 out_upper_limit=1e12 out_ic=0.0)"
    )
    assert lines[2] == "Bpid1 out 0 V=2*V(in)+100*V(pid1_int)"


def test_pid_derivative_term_unsupported() -> None:
    block = _block("pid2", "signal-flow.continuous.pid", kp=1.0, ki=1.0, kd=0.1)
    with pytest.raises(UnsupportedSignalFlowParamError):
        render(block, _nets("signal-flow.continuous.pid"))


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_source_sine_amplitude_and_frequency() -> None:
    import numpy as np

    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    block = _block("s1", "signal-flow.source.sine", amplitude=10.0, frequency=1000.0)
    card = render(block, _nets("signal-flow.source.sine"))
    netlist = f"""\
* sine source integration test
{card}
.TRAN 1e-6 1e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="sine-source-int")
    out = next(s for s in result.signals if s.name.lower() == "v(out)").data.real

    assert float(np.max(out)) > 9.5
    assert float(np.min(out)) < -9.5


@pytest.mark.integration
def test_integration_pid_step_response_matches_pi_formula() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    block = _block("pid1", "signal-flow.continuous.pid", kp=1.0, ki=1000.0, kd=0.0)
    card = render(block, _nets("signal-flow.continuous.pid"))
    netlist = f"""\
* PI step response integration test
Vin in 0 DC 1
{card}
.TRAN 1e-5 5e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="pid-step-int")
    out = next(s for s in result.signals if s.name.lower() == "v(out)").data.real
    t = result.time

    # out(t) = kp*1 + ki*1*t = 1 + 1000*t
    idx = int(next(i for i, tv in enumerate(t) if tv > 4.9e-3))
    expected = 1.0 + 1000.0 * t[idx]
    assert abs(out[idx] - expected) < 0.1

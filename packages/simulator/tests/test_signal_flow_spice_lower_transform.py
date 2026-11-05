"""BE-70 — rotating-frame transform compiler pass for signal-flow blocks.

Covers:
- Exact B-source card text for each transform block (Clarke/Park and their
  inverses, plus angle_wrap).
- Real ngspice round-trip: abc -> alpha_beta -> dq -> dq_inv -> alpha_beta_inv
  reproduces the original three-phase signals within tolerance.
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


def test_alpha_beta_card_text() -> None:
    block = _sf_block("t1", "signal-flow.transform.alpha_beta")
    text = render(block, _nets("signal-flow.transform.alpha_beta"))
    lines = text.splitlines()

    assert lines[0] == "Bt1_alpha alpha 0 V=(2/3)*(V(a)-0.5*V(b)-0.5*V(c))"
    assert lines[1] == "Bt1_beta beta 0 V=0.5773502691896258*(V(b)-V(c))"


def test_alpha_beta_inv_card_text() -> None:
    block = _sf_block("t2", "signal-flow.transform.alpha_beta_inv")
    text = render(block, _nets("signal-flow.transform.alpha_beta_inv"))
    lines = text.splitlines()

    assert lines[0] == "Bt2_a a 0 V=V(alpha)"
    assert lines[1] == "Bt2_b b 0 V=-0.5*V(alpha)+0.8660254037844386*V(beta)"
    assert lines[2] == "Bt2_c c 0 V=-0.5*V(alpha)-0.8660254037844386*V(beta)"


def test_dq_card_text() -> None:
    block = _sf_block("t3", "signal-flow.transform.dq")
    text = render(block, _nets("signal-flow.transform.dq"))
    lines = text.splitlines()

    assert lines[0] == "Bt3_d d 0 V=V(alpha)*cos(V(theta))+V(beta)*sin(V(theta))"
    assert lines[1] == "Bt3_q q 0 V=-V(alpha)*sin(V(theta))+V(beta)*cos(V(theta))"


def test_dq_inv_card_text() -> None:
    block = _sf_block("t4", "signal-flow.transform.dq_inv")
    text = render(block, _nets("signal-flow.transform.dq_inv"))
    lines = text.splitlines()

    assert lines[0] == "Bt4_alpha alpha 0 V=V(d)*cos(V(theta))-V(q)*sin(V(theta))"
    assert lines[1] == "Bt4_beta beta 0 V=V(d)*sin(V(theta))+V(q)*cos(V(theta))"


def test_angle_wrap_card_text() -> None:
    block = _sf_block("t5", "signal-flow.transform.angle_wrap")
    text = render(block, _nets("signal-flow.transform.angle_wrap"))

    assert text == "Bt5 out 0 V=V(in)-6.283185307179586*floor(V(in)/6.283185307179586)"


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_clarke_park_round_trip_reproduces_abc() -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    ab = _sf_block("ab1", "signal-flow.transform.alpha_beta")
    dq = _sf_block("dq1", "signal-flow.transform.dq")
    dqi = _sf_block("dqi1", "signal-flow.transform.dq_inv")
    abi = _sf_block("abi1", "signal-flow.transform.alpha_beta_inv")

    ab_nets = {"a": "a", "b": "b", "c": "c", "alpha": "alpha", "beta": "beta"}
    dq_nets = {"alpha": "alpha", "beta": "beta", "theta": "theta", "d": "d", "q": "q"}
    dqi_nets = {"d": "d", "q": "q", "theta": "theta", "alpha": "alpha2", "beta": "beta2"}
    abi_nets = {
        "alpha": "alpha2",
        "beta": "beta2",
        "a": "a2",
        "b": "b2",
        "c": "c2",
    }

    netlist = f"""\
* Clarke/Park round-trip: abc -> alpha_beta -> dq -> dq_inv -> alpha_beta_inv
Va a 0 SIN(0 100 50)
Vb b 0 SIN(0 100 50 0 0 -120)
Vc c 0 SIN(0 100 50 0 0 -240)
Btheta theta 0 V=2*3.141592653589793*50*time
{render(ab, ab_nets)}
{render(dq, dq_nets)}
{render(dqi, dqi_nets)}
{render(abi, abi_nets)}
.TRAN 1e-5 40e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="clarke-park-roundtrip")

    def sig(name: str) -> np.ndarray:
        return next(s.data for s in result.signals if s.name.lower() == f"v({name})")

    t = result.time
    # skip the first cycle to let any startup transient settle
    idx = t > 10e-3
    for orig, reconstructed in (("a", "a2"), ("b", "b2"), ("c", "c2")):
        diff = np.asarray(sig(orig))[idx] - np.asarray(sig(reconstructed))[idx]
        assert np.max(np.abs(diff)) < 1.0

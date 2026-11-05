"""BE-38 — physical-network DAE lowering tests (Mode A).

Acceptance coverage:
- translational mass+spring+damper lowers to a 2-state DAE with damped oscillation
- rotational inertia + torque source lowers to 1-state with alpha = tau / J
- thermal RC lowers to first-order temperature decay
- missing reference raises NoReferenceError with domain name
- translational + thermal in one model lower to two independent DAESystems
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
import pytest
from scipy.integrate import solve_ivp

from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph


def _import_be38():  # type: ignore[no-untyped-def]
    try:
        import simulator.compiler.physical_network_lower as lower_mod
        from simulator.compiler.physical_network_lower import lower_physical_network

        return lower_mod, lower_physical_network
    except (ImportError, AttributeError):
        pytest.xfail("simulator.compiler.physical_network_lower not yet implemented")


def _lower_domain(ir1: IR1Graph, domain: str):  # type: ignore[no-untyped-def]
    _mod, lower_physical_network = _import_be38()
    try:
        return lower_physical_network(ir1, domain=domain)
    except TypeError:
        # Allow positional signature: lower_physical_network(ir1, domain)
        return lower_physical_network(ir1, domain)


def _state_count(system: Any) -> int:
    if isinstance(getattr(system, "n_states", None), int):
        return int(system.n_states)
    state_vars = getattr(system, "state_vars", None)
    if isinstance(state_vars, (list, tuple, dict)):
        return len(state_vars)
    x0 = getattr(system, "x0", None)
    if isinstance(x0, (list, tuple, np.ndarray)):
        return len(x0)
    mass = getattr(system, "mass_matrix", None)
    if isinstance(mass, np.ndarray) and mass.ndim == 2 and mass.shape[0] == mass.shape[1]:
        return int(mass.shape[0])
    raise AssertionError("Could not infer number of DAE states from system")


def _simulate_states(system: Any, t_end: float, n_samples: int = 1200):
    """Simulate via DAESystem.simulate(...) if available, otherwise rhs+mass_matrix."""
    simulate = getattr(system, "simulate", None)
    if callable(simulate):
        out = simulate(t_span=(0.0, t_end), n_samples=n_samples)
        if isinstance(out, tuple) and len(out) == 2:
            t, x = out
            t_arr = np.asarray(t, dtype=float)
            x_arr = np.asarray(x, dtype=float)
            if x_arr.ndim == 1:
                x_arr = x_arr[:, None]
            return t_arr, x_arr

    rhs = getattr(system, "rhs", None)
    assert callable(rhs), "DAESystem must expose rhs(t, x) or simulate(...) for dynamics checks"

    n_states = _state_count(system)
    x0_raw = getattr(system, "x0", np.zeros(n_states))
    x0 = np.asarray(x0_raw, dtype=float)
    assert x0.shape == (n_states,), f"x0 shape mismatch: expected {(n_states,)}, got {x0.shape}"

    mass_raw = getattr(system, "mass_matrix", np.eye(n_states))
    mass = np.asarray(mass_raw, dtype=float)
    if mass.shape != (n_states, n_states):
        mass = np.eye(n_states)

    def f(t: float, x: np.ndarray) -> np.ndarray:
        rhs_val = np.asarray(rhs(t, x), dtype=float)
        if rhs_val.shape != (n_states,):
            raise AssertionError(f"rhs(t, x) must return shape {(n_states,)}, got {rhs_val.shape}")
        return np.linalg.solve(mass, rhs_val)

    t_eval = np.linspace(0.0, t_end, n_samples)
    sol = solve_ivp(
        f,
        (0.0, t_end),
        x0,
        t_eval=t_eval,
        method="Radau",
        rtol=1e-7,
        atol=1e-9,
    )
    assert sol.success, f"DAE simulation failed: {sol.message}"
    return sol.t, sol.y.T


def _conn(a_blk: str, a_port: str, b_blk: str, b_port: str, kind: str) -> IR1Connection:
    return IR1Connection(src=(a_blk, a_port), dst=(b_blk, b_port), kind=kind)


def _build_translational_msd_ir1(with_reference: bool = True) -> IR1Graph:
    blocks = [
        IR1Block(
            instance_id="mass",
            block_type="physical-translational.element.mass",
            paradigm="physical-network",
            domain="physical-translational",
            params={"m": 1.0, "x0": 1.0, "v0": 0.0},
            ic={"x": 1.0, "v": 0.0},
        ),
        IR1Block(
            instance_id="spring",
            block_type="physical-translational.element.spring",
            paradigm="physical-network",
            domain="physical-translational",
            params={"k": 9.0, "x0": 1.0},
            ic={"x": 1.0},
        ),
        IR1Block(
            instance_id="damper",
            block_type="physical-translational.element.damper",
            paradigm="physical-network",
            domain="physical-translational",
            params={"c": 0.5},
        ),
    ]
    if with_reference:
        blocks.append(
            IR1Block(
                instance_id="world",
                block_type="physical-translational.reference.world",
                paradigm="physical-network",
                domain="physical-translational",
                params={},
            )
        )

    conns = [
        _conn("mass", "a", "spring", "a", "physical-translational"),
        _conn("spring", "a", "damper", "a", "physical-translational"),
        _conn("mass", "b", "spring", "b", "physical-translational"),
        _conn("spring", "b", "damper", "b", "physical-translational"),
    ]
    if with_reference:
        conns.append(_conn("damper", "b", "world", "p", "physical-translational"))

    return IR1Graph(blocks=blocks, connections=conns)


def _build_rotational_inertia_ir1() -> IR1Graph:
    blocks = [
        IR1Block(
            instance_id="torque",
            block_type="physical-rotational.source.torque",
            paradigm="physical-network",
            domain="physical-rotational",
            params={"T": 2.0},
        ),
        IR1Block(
            instance_id="inertia",
            block_type="physical-rotational.element.inertia",
            paradigm="physical-network",
            domain="physical-rotational",
            params={"J": 0.5, "x0": 0.0},
            ic={"omega": 0.0},
        ),
        IR1Block(
            instance_id="world",
            block_type="physical-rotational.reference.world",
            paradigm="physical-network",
            domain="physical-rotational",
            params={},
        ),
    ]
    conns = [
        _conn("torque", "a", "inertia", "a", "physical-rotational"),
        _conn("torque", "b", "inertia", "b", "physical-rotational"),
        _conn("inertia", "b", "world", "p", "physical-rotational"),
    ]
    return IR1Graph(blocks=blocks, connections=conns)


def _build_thermal_rc_ir1() -> IR1Graph:
    blocks = [
        IR1Block(
            instance_id="cmass",
            block_type="physical-thermal.element.mass",
            paradigm="physical-network",
            domain="physical-thermal",
            params={"C": 2.0, "x0": 100.0, "T0": 100.0},
            ic={"T": 100.0},
        ),
        IR1Block(
            instance_id="rth",
            block_type="physical-thermal.element.conductor",
            paradigm="physical-network",
            domain="physical-thermal",
            params={"G": 0.5},
        ),
        IR1Block(
            instance_id="tref",
            block_type="physical-thermal.reference.absolute",
            paradigm="physical-network",
            domain="physical-thermal",
            params={"T": 20.0},
        ),
    ]
    conns = [
        _conn("cmass", "a", "rth", "a", "physical-thermal"),
        _conn("cmass", "b", "rth", "b", "physical-thermal"),
        _conn("rth", "b", "tref", "p", "physical-thermal"),
    ]
    return IR1Graph(blocks=blocks, connections=conns)


def _build_two_domain_ir1() -> IR1Graph:
    trans = _build_translational_msd_ir1(with_reference=True)
    therm = _build_thermal_rc_ir1()
    return IR1Graph(
        blocks=[*trans.blocks, *therm.blocks],
        connections=[*trans.connections, *therm.connections],
    )


def _find_domain_dispatcher(mod: Any) -> Callable[..., Any] | None:
    for name in (
        "lower_all_physical_networks",
        "lower_physical_networks",
        "lower_physical_domains",
    ):
        fn = getattr(mod, name, None)
        if callable(fn):
            return fn
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_lower_mass_spring_damper() -> None:
    ir1 = _build_translational_msd_ir1(with_reference=True)
    dae = _lower_domain(ir1, "physical-translational")

    assert _state_count(dae) == 2

    t, x = _simulate_states(dae, t_end=8.0, n_samples=2000)
    assert t.shape[0] == x.shape[0]

    # Pick the most oscillatory state and check damped behavior.
    idx = int(np.argmax(np.std(x, axis=0)))
    sig = x[:, idx]
    sig = sig - np.mean(sig[-200:])

    sign_changes = int(np.count_nonzero(np.diff(np.signbit(sig))))
    assert sign_changes >= 2, "Expected oscillatory behavior (multiple zero crossings)"

    early_peak = float(np.max(np.abs(sig[:500])))
    late_peak = float(np.max(np.abs(sig[-500:])))
    assert late_peak < 0.7 * early_peak, "Expected damped envelope decay"


def test_lower_rotational_inertia() -> None:
    ir1 = _build_rotational_inertia_ir1()
    dae = _lower_domain(ir1, "physical-rotational")

    assert _state_count(dae) == 1

    rhs = getattr(dae, "rhs", None)
    assert callable(rhs), "DAESystem must expose rhs(t, x)"

    x0 = np.asarray(getattr(dae, "x0", np.zeros(1)), dtype=float)
    mass = np.asarray(getattr(dae, "mass_matrix", np.eye(1)), dtype=float)
    rhs0 = np.asarray(rhs(0.0, x0), dtype=float)
    alpha = float(np.linalg.solve(mass, rhs0)[0])

    tau = 2.0
    J = 0.5
    assert alpha == pytest.approx(tau / J, rel=1e-4, abs=1e-6)


def test_lower_thermal_rc() -> None:
    ir1 = _build_thermal_rc_ir1()
    dae = _lower_domain(ir1, "physical-thermal")

    assert _state_count(dae) == 1

    t, x = _simulate_states(dae, t_end=12.0, n_samples=1400)
    temp = x[:, 0]

    t_ref = 20.0
    err0 = abs(float(temp[0] - t_ref))
    err_end = abs(float(temp[-1] - t_ref))
    assert err_end < err0, "Temperature must decay toward the absolute reference"

    tau = 2.0 / 0.5  # C / G
    i_tau = int(np.searchsorted(t, tau))
    err_tau = abs(float(temp[i_tau] - t_ref))
    ratio = err_tau / max(err0, 1e-12)
    assert ratio == pytest.approx(np.exp(-1.0), rel=0.25)


def test_no_reference_error() -> None:
    mod, _ = _import_be38()
    no_ref_exc = getattr(mod, "NoReferenceError", None)
    assert no_ref_exc is not None, "NoReferenceError must be defined in physical_network_lower"

    ir1 = _build_translational_msd_ir1(with_reference=False)
    with pytest.raises(no_ref_exc) as exc_info:
        _lower_domain(ir1, "physical-translational")

    msg = str(exc_info.value).lower()
    assert "physical-translational" in msg


def test_two_domains_independent() -> None:
    mod, _ = _import_be38()
    ir1 = _build_two_domain_ir1()

    dispatch = _find_domain_dispatcher(mod)
    if dispatch is not None:
        systems = dispatch(ir1)
        if isinstance(systems, dict):
            by_domain = dict(systems)
        else:
            by_domain = {}
            for item in systems:
                dom = getattr(item, "domain", None)
                if dom is not None:
                    by_domain[str(dom)] = item
    else:
        by_domain = {
            "physical-translational": _lower_domain(ir1, "physical-translational"),
            "physical-thermal": _lower_domain(ir1, "physical-thermal"),
        }

    assert "physical-translational" in by_domain
    assert "physical-thermal" in by_domain

    trans_sys = by_domain["physical-translational"]
    therm_sys = by_domain["physical-thermal"]
    assert trans_sys is not therm_sys

    assert _state_count(trans_sys) >= 1
    assert _state_count(therm_sys) >= 1

    # If systems expose per-block metadata, ensure no cross-domain leakage.
    for domain, sys in by_domain.items():
        blocks = getattr(sys, "blocks", None)
        if blocks is None:
            continue
        for blk in blocks:
            blk_domain = getattr(blk, "domain", None)
            if blk_domain is None and hasattr(blk, "block"):
                blk_domain = getattr(blk.block, "domain", None)
            if blk_domain is not None:
                assert str(blk_domain) == domain

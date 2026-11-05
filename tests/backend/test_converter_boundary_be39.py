"""BE-39 — converter boundary and cross-paradigm wiring tests (Mode A)."""

from __future__ import annotations

import importlib.util
import pathlib
from typing import Any

import pytest
import yaml

from simulator.compiler.converter_lower import CrossParadigmWireError
from simulator.compiler.ir1_builder import build_ir1

REPO_ROOT = pathlib.Path(__file__).parents[2]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks"


def _load_equations(block_type: str) -> Any:  # type: ignore[no-untyped-def]
    eq_path = BLOCKS_ROOT / pathlib.Path(*block_type.split(".")) / "equations.py"
    assert eq_path.exists(), f"Missing equations.py for {block_type} at {eq_path}"

    spec = importlib.util.spec_from_file_location(block_type.replace(".", "_"), eq_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module.Equations()


def _load_metadata(block_type: str) -> dict[str, Any]:
    metadata_path = BLOCKS_ROOT / pathlib.Path(*block_type.split(".")) / "metadata.yaml"
    assert metadata_path.exists(), f"Missing metadata.yaml for {block_type} at {metadata_path}"
    return yaml.safe_load(metadata_path.read_text(encoding="utf-8"))


def test_signal_to_ps_passthrough() -> None:
    """constant=5 through signal_to_physical_signal drives controlled_voltage to V=5."""
    conv = _load_equations("converter.signal_to_physical_signal")

    out, _ = conv.derivatives(
        t=0.0,
        inputs={"in": 5.0},
        state={},
        params={"gain": 1.0},
    )
    physical_signal = out["out"]
    assert physical_signal == pytest.approx(5.0)

    # Controlled-voltage source uses gain * control input as commanded voltage.
    cv_meta = _load_metadata("physical-electrical.source.voltage.controlled_voltage")
    gain_default = next(p["default"] for p in cv_meta["params"] if p["name"] == "gain")

    commanded_voltage = float(gain_default) * float(physical_signal)
    assert commanded_voltage == pytest.approx(5.0)


def test_dc_motor_couple() -> None:
    """electrical_to_rotational with kt=ke=0.01 admits steady-state ω = V/ke."""
    motor = _load_equations("converter.electrical_to_rotational")

    V = 12.0
    ke = 0.01
    kt = 0.01
    omega_ss = V / ke

    # At steady state for an ideal no-load motor with inertia, i -> 0 and tau -> 0,
    # and back-EMF matches source voltage: v_arm = ke * omega.
    residuals = motor.residuals(
        state={"v_arm": V, "omega": omega_ss, "i_arm": 0.0, "tau": 0.0},
        params={"kt": kt, "ke": ke},
    )

    assert residuals[0] == pytest.approx(0.0)  # tau - kt*i
    assert residuals[1] == pytest.approx(0.0)  # v_arm - ke*omega


def test_translational_to_rotational_radius() -> None:
    """rotational_to_translational with radius=0.05 yields F = τ/radius."""
    conv = _load_equations("converter.rotational_to_translational")

    tau = 2.0
    radius = 0.05
    expected_force = tau / radius

    residuals = conv.residuals(
        state={"tau": tau, "F": expected_force, "omega": 0.0, "v": 0.0},
        params={"radius": radius},
    )

    assert expected_force == pytest.approx(40.0)
    assert residuals[0] == pytest.approx(0.0)  # tau - radius*F


def test_cross_paradigm_no_converter_fails() -> None:
    """signal-flow → physical-network direct wire raises CrossParadigmWireError at IR-1 build."""
    doc = {
        "model": {
            "blocks": [
                {
                    "id": "src",
                    "type": "signal-flow.source.constant",
                    "params": {"value": 1.0},
                },
                {
                    "id": "r1",
                    "type": "physical-electrical.passive.resistor",
                    "params": {"R": 100.0},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "src", "port": "out"},
                    "to": {"block": "r1", "port": "p"},
                }
            ],
        }
    }

    with pytest.raises(CrossParadigmWireError) as exc_info:
        build_ir1(doc)

    msg = str(exc_info.value)
    assert "src" in msg and "r1" in msg
    assert "converter" in msg.lower()

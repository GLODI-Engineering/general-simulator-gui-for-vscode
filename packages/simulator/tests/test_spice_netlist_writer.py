"""BE-24 — IR-1 circuit domain detector + SPICE netlist writer tests.

Covers every acceptance bullet from progress.backend.yaml BE-24:

- IR-1 with one passive.resistor → netlist contains "R" element line, ".TRAN", ".END".
- IR-1 with V source + R + C (RC circuit) → V, R, C lines present; one net is "0".
- analysis_type="AC" → ".AC" line present, no ".TRAN".
- is_circuit_block("passive.resistor") is True; is_circuit_block("control.gain") is False.
- Unknown block type raises ValueError.
- Net assignment is deterministic for a given IR-1.
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# Import helpers — xfail gracefully if not implemented yet
# ---------------------------------------------------------------------------


def _import_writer():  # type: ignore[no-untyped-def]
    try:
        from simulator.compiler.spice_netlist_writer import (
            is_circuit_block,
            write_netlist,
        )
        from simulator.solvers.protocol import SolverOptions

        return write_netlist, is_circuit_block, SolverOptions
    except (ImportError, AttributeError) as exc:
        pytest.xfail(f"simulator.compiler.spice_netlist_writer not yet implemented: {exc}")


def _make_ir1(*blocks_kw):  # type: ignore[no-untyped-def]
    from simulator.ir.ir1 import IR1Block, IR1Graph

    blocks = []
    connections = []
    for kw in blocks_kw:
        blocks.append(IR1Block(**kw))
    return IR1Graph(blocks=blocks, connections=connections)


def _make_ir1_with_connections(blocks_kw, conns_kw):  # type: ignore[no-untyped-def]
    from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph

    blocks = [IR1Block(**kw) for kw in blocks_kw]
    conns = [IR1Connection(**kw) for kw in conns_kw]
    return IR1Graph(blocks=blocks, connections=conns)


# ---------------------------------------------------------------------------
# is_circuit_block
# ---------------------------------------------------------------------------


def test_is_circuit_block_passive_resistor() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("passive.resistor") is True


def test_is_circuit_block_passive_capacitor() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("passive.capacitor") is True


def test_is_circuit_block_source_voltage_dc() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("source.voltage.dc") is True


def test_is_circuit_block_semi_bjt_npn() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("semi.bjt.npn") is True


def test_is_circuit_block_tline() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("tline.lossless") is True


def test_is_circuit_block_control_gain_is_false() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("control.gain") is False


def test_is_circuit_block_signal_step_is_false() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("signal.step") is False


def test_is_circuit_block_sinks_scope_is_false() -> None:
    _, is_circuit_block, _ = _import_writer()
    assert is_circuit_block("sinks.scope") is False


# ---------------------------------------------------------------------------
# write_netlist — single resistor
# ---------------------------------------------------------------------------


def test_single_resistor_netlist_contains_r_element() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {
            "instance_id": "r1",
            "block_type": "passive.resistor",
            "params": {"R": 1000.0},
        }
    )
    netlist = write_netlist(ir1, SolverOptions())
    lines = netlist.splitlines()
    assert any(line.startswith("R") for line in lines), (
        f"Expected an R element line in netlist:\n{netlist}"
    )


def test_single_resistor_netlist_contains_tran() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {
            "instance_id": "r1",
            "block_type": "passive.resistor",
            "params": {"R": 1000.0},
        }
    )
    netlist = write_netlist(ir1, SolverOptions())
    assert ".TRAN" in netlist, f"Expected .TRAN in netlist:\n{netlist}"


def test_single_resistor_netlist_ends_with_end() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {
            "instance_id": "r1",
            "block_type": "passive.resistor",
            "params": {"R": 1000.0},
        }
    )
    netlist = write_netlist(ir1, SolverOptions())
    assert netlist.strip().endswith(".END"), f"Netlist must end with .END:\n{netlist}"


# ---------------------------------------------------------------------------
# write_netlist — RC circuit
# ---------------------------------------------------------------------------


def test_rc_circuit_contains_v_r_c_lines() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1_with_connections(
        blocks_kw=[
            {
                "instance_id": "v1",
                "block_type": "source.voltage.dc",
                "params": {"V": 5.0},
            },
            {
                "instance_id": "r1",
                "block_type": "passive.resistor",
                "params": {"R": 1000.0},
            },
            {
                "instance_id": "c1",
                "block_type": "passive.capacitor",
                "params": {"C": 1e-6},
            },
        ],
        conns_kw=[
            {"src": ("v1", "p"), "dst": ("r1", "p")},
            {"src": ("r1", "n"), "dst": ("c1", "p")},
            {"src": ("c1", "n"), "dst": ("v1", "n")},
        ],
    )
    options = SolverOptions()
    netlist = write_netlist(ir1, options)
    lines = netlist.splitlines()
    assert any(line.startswith("V") for line in lines), "Expected V element line"
    assert any(line.startswith("R") for line in lines), "Expected R element line"
    assert any(line.startswith("C") for line in lines), "Expected C element line"


def test_rc_circuit_has_ground_net_zero() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1_with_connections(
        blocks_kw=[
            {"instance_id": "v1", "block_type": "source.voltage.dc", "params": {"V": 5.0}},
            {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}},
            {"instance_id": "c1", "block_type": "passive.capacitor", "params": {"C": 1e-6}},
        ],
        conns_kw=[
            {"src": ("v1", "p"), "dst": ("r1", "p")},
            {"src": ("r1", "n"), "dst": ("c1", "p")},
            {"src": ("c1", "n"), "dst": ("v1", "n")},
        ],
    )
    netlist = write_netlist(ir1, SolverOptions())
    # At least one net must be named "0" (SPICE ground)
    assert " 0 " in netlist or netlist.endswith(" 0"), (
        f"Expected net '0' (ground) in netlist:\n{netlist}"
    )


# ---------------------------------------------------------------------------
# write_netlist — analysis type variants
# ---------------------------------------------------------------------------


def test_ac_analysis_produces_ac_line_not_tran() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}}
    )
    options = SolverOptions(analysis_type="AC")  # type: ignore[call-arg]
    netlist = write_netlist(ir1, options)
    assert ".AC" in netlist, f"Expected .AC in netlist:\n{netlist}"
    assert ".TRAN" not in netlist, f"Did not expect .TRAN in AC netlist:\n{netlist}"


def test_dc_analysis_produces_dc_line() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1({"instance_id": "v1", "block_type": "source.voltage.dc", "params": {"V": 5.0}})
    options = SolverOptions(
        analysis_type="DC", dc_source="V_v1", dc_start=0.0, dc_stop=5.0, dc_step=0.1
    )  # type: ignore[call-arg]
    netlist = write_netlist(ir1, options)
    assert ".DC" in netlist, f"Expected .DC in netlist:\n{netlist}"


def test_op_analysis_produces_op_line() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}}
    )
    options = SolverOptions(analysis_type="OP")  # type: ignore[call-arg]
    netlist = write_netlist(ir1, options)
    assert ".OP" in netlist, f"Expected .OP in netlist:\n{netlist}"


# ---------------------------------------------------------------------------
# write_netlist — error cases
# ---------------------------------------------------------------------------


def test_unknown_block_type_raises_value_error() -> None:
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1({"instance_id": "x1", "block_type": "unknown.widget", "params": {}})
    with pytest.raises(ValueError, match=r"unknown\.widget"):
        write_netlist(ir1, SolverOptions())


def test_instance_id_sanitised_in_element_name() -> None:
    """Instance IDs with non-alphanumeric chars must be sanitised."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {
            "instance_id": "r-1 bad id!",
            "block_type": "passive.resistor",
            "params": {"R": 100.0},
        }
    )
    netlist = write_netlist(ir1, SolverOptions())
    # Sanitised: only alphanumeric + underscore should appear in the element name
    import re

    element_lines = [ln for ln in netlist.splitlines() if ln.startswith("R")]
    assert element_lines, "Expected an R element line"
    name_token = element_lines[0].split()[0]
    assert re.match(r"^[A-Za-z][A-Za-z0-9_]*$", name_token), (
        f"Element name not sanitised: {name_token!r}"
    )


# ---------------------------------------------------------------------------
# write_netlist — determinism
# ---------------------------------------------------------------------------


def test_net_assignment_is_deterministic() -> None:
    """Two calls with identical IR-1 must produce byte-identical netlists."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1_with_connections(
        blocks_kw=[
            {"instance_id": "v1", "block_type": "source.voltage.dc", "params": {"V": 5.0}},
            {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}},
        ],
        conns_kw=[{"src": ("v1", "p"), "dst": ("r1", "p")}],
    )
    options = SolverOptions()
    first = write_netlist(ir1, options)
    second = write_netlist(ir1, options)
    assert first == second, "write_netlist must be deterministic for identical inputs"


# ---------------------------------------------------------------------------
# write_netlist — UIC and IC= initial conditions
# ---------------------------------------------------------------------------


def test_tran_with_uic_emits_uic_suffix() -> None:
    """SolverOptions(uic=True) must append UIC to the .TRAN line."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}},
    )
    options = SolverOptions(analysis_type="TRAN", t_end=1e-3, n_samples=100, uic=True)
    netlist = write_netlist(ir1, options)
    tran_line = next(ln for ln in netlist.splitlines() if ln.startswith(".TRAN"))
    assert tran_line.endswith(" UIC"), f"Expected .TRAN line to end with ' UIC', got: {tran_line!r}"


def test_tran_without_uic_has_no_uic_suffix() -> None:
    """SolverOptions(uic=False) must not add UIC to the .TRAN line."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "r1", "block_type": "passive.resistor", "params": {"R": 1000.0}},
    )
    options = SolverOptions(analysis_type="TRAN", t_end=1e-3, n_samples=100, uic=False)
    netlist = write_netlist(ir1, options)
    tran_line = next(ln for ln in netlist.splitlines() if ln.startswith(".TRAN"))
    assert "UIC" not in tran_line, f"Expected no UIC in .TRAN line, got: {tran_line!r}"


def test_capacitor_with_ic_param_emits_ic_in_netlist() -> None:
    """A capacitor block with params['IC']=0 must emit IC=0 in its element line."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "c1", "block_type": "passive.capacitor", "params": {"C": 1e-6, "IC": 0}},
    )
    options = SolverOptions(analysis_type="TRAN", t_end=1e-3, uic=True)
    netlist = write_netlist(ir1, options)
    cap_line = next(ln for ln in netlist.splitlines() if ln.startswith("Cc1"))
    assert "IC=0" in cap_line, f"Expected IC=0 in capacitor line, got: {cap_line!r}"


def test_capacitor_without_ic_param_has_no_ic() -> None:
    """A capacitor block without params['IC'] must not emit IC= in its line."""
    write_netlist, _, SolverOptions = _import_writer()

    ir1 = _make_ir1(
        {"instance_id": "c1", "block_type": "passive.capacitor", "params": {"C": 1e-6}},
    )
    options = SolverOptions()
    netlist = write_netlist(ir1, options)
    cap_line = next(ln for ln in netlist.splitlines() if ln.startswith("Cc1"))
    assert "IC=" not in cap_line, (
        f"Expected no IC= in capacitor line without IC param, got: {cap_line!r}"
    )

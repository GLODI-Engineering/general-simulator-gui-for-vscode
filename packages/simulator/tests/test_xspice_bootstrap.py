"""BE-60 — XSPICE runtime bootstrap.

Covers:
- ensure_xspice_env generates a spinit with unconditional codemodel lines
  pointing at a space-free symlink, regardless of whether the real
  codemodel directory's path contains spaces.
- XSpiceNotAvailableError when the ngspice binary has no *.cm files.
- Integration: a real gain->integrator XSPICE chain solves via
  NgspiceSolver.solve() with no manual environment setup by the caller.
"""

from __future__ import annotations

import pathlib

import pytest

from simulator.solvers.xspice_bootstrap import XSpiceNotAvailableError, ensure_xspice_env


def _fake_ngspice_install(tmp_path: pathlib.Path, dirname: str) -> pathlib.Path:
    install = tmp_path / dirname
    (install / "bin").mkdir(parents=True)
    cm_dir = install / "lib" / "ngspice"
    cm_dir.mkdir(parents=True)
    for name in ("analog.cm", "digital.cm", "table.cm"):
        (cm_dir / name).write_bytes(b"")
    ngspice_path = install / "bin" / "ngspice"
    ngspice_path.write_bytes(b"")
    return ngspice_path


def test_ensure_xspice_env_generates_working_spinit(tmp_path: pathlib.Path) -> None:
    ngspice_path = _fake_ngspice_install(tmp_path, "ngspice-46")
    cache_root = tmp_path / "cache"

    env = ensure_xspice_env(ngspice_path, cache_root=cache_root)

    assert env["SPICE_SCRIPTS"] == str(cache_root)
    spinit_text = (cache_root / "spinit").read_text(encoding="utf-8")
    assert "set xspice_enabled" in spinit_text
    assert "if $?xspice_enabled" not in spinit_text
    for name in ("analog.cm", "digital.cm", "table.cm"):
        assert f"codemodel {cache_root / 'codemodels' / name}" in spinit_text
    # The codemodel line must reference the symlink, not the real (fake)
    # install path, directly.
    assert str(ngspice_path.parent.parent) not in spinit_text


def test_ensure_xspice_env_handles_spaces_in_path(tmp_path: pathlib.Path) -> None:
    spacey_root = tmp_path / "has a space" / "install root"
    spacey_root.mkdir(parents=True)
    ngspice_path = _fake_ngspice_install(spacey_root, "ngspice-46")
    cache_root = tmp_path / "cache"

    env = ensure_xspice_env(ngspice_path, cache_root=cache_root)

    spinit_text = (cache_root / "spinit").read_text(encoding="utf-8")
    for line in spinit_text.splitlines():
        if line.startswith("codemodel"):
            assert " " not in line.split("codemodel ", 1)[1], (
                f"codemodel line still contains a space: {line!r}"
            )
    assert env["SPICE_SCRIPTS"] == str(cache_root)


def test_missing_xspice_build_raises_clear_error(tmp_path: pathlib.Path) -> None:
    install = tmp_path / "ngspice-no-xspice"
    (install / "bin").mkdir(parents=True)
    (install / "lib" / "ngspice").mkdir(parents=True)  # exists but empty
    ngspice_path = install / "bin" / "ngspice"
    ngspice_path.write_bytes(b"")

    with pytest.raises(XSpiceNotAvailableError, match="XSPICE"):
        ensure_xspice_env(ngspice_path, cache_root=tmp_path / "cache")


# ---------------------------------------------------------------------------
# Integration — skipped if ngspice not found on host
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_xspice_gain_integrator_chain(tmp_path: pathlib.Path) -> None:
    from simulator.solvers.ngspice_solver import NgspiceSolver, discover_ngspice

    ng_path = discover_ngspice()
    if ng_path is None:
        pytest.skip("ngspice not found on this host — skipping integration test")

    netlist = """\
* XSPICE gain->integrator smoke test
.model myint int(gain=1.0 out_lower_limit=-1e12 out_upper_limit=1e12)
.model mygain gain(gain=2.0)
Vin 1 0 DC 0 PULSE(0 1 0 1u 1u 1m 2m)
Again 1 2 mygain
Aint 2 3 myint
R1 3 0 1k
.TRAN 1e-4 2e-3
.END
"""
    solver = NgspiceSolver(ngspice_path=ng_path)
    result = solver.solve(netlist, sim_id="xspice-int")

    signal_names = [s.name for s in result.signals]
    assert any("3" in n for n in signal_names), f"Expected a v(3) signal, got: {signal_names}"

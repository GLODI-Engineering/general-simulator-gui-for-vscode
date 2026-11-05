"""BE-01 — CLI invocation tests.

Tests the entry-point argument parsing via subprocess; no server is started
because the import of kernel_sidecar.server (which is wired in main()) happens
only at call time and the process crashes at the WS bind step, not before.
"""

from __future__ import annotations

import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run(*args: str, timeout: int = 5) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "kernel_sidecar", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_help_exits_zero() -> None:
    """--help must print argparse usage and exit 0."""
    result = _run("--help")
    assert result.returncode == 0
    assert "kernel_sidecar" in result.stdout
    assert "--port" in result.stdout
    assert "--token" in result.stdout


def test_missing_token_exits_nonzero() -> None:
    """Omitting --token (required) must produce a non-zero exit."""
    result = _run("--port", "0")
    assert result.returncode != 0
    # argparse writes to stderr for missing required args
    assert "token" in result.stderr.lower() or "error" in result.stderr.lower()


def test_token_accepted_crashes_only_at_server_bind() -> None:
    """With valid --port 0 --token <hex>, the process must not crash before the
    WebSocket bind step.  We verify this by checking that any early crash does
    NOT mention argparse / settings errors — we expect either no output or a
    ModuleNotFoundError / AttributeError from server.py (which isn't written yet
    in the CI that runs against stubs)."""
    result = _run("--port", "0", "--token", "deadbeef" * 8, timeout=3)
    # The process may exit non-zero (because server.py is a stub), but it must
    # not produce an argparse error on stderr.
    assert "error: argument" not in result.stderr.lower(), (
        f"Argparse rejected valid args: {result.stderr!r}"
    )


def test_port_flag_parsed() -> None:
    """--port N must be accepted by argparse without complaints."""
    result = _run("--port", "9999", "--token", "aa" * 32, timeout=3)
    # argparse-level rejection would mention 'error: argument --port'
    assert "error: argument --port" not in result.stderr


def test_workdir_flag_accepted() -> None:
    """--workdir must be an accepted optional argument."""
    result = _run("--help")
    assert "--workdir" in result.stdout


def test_version_regex_in_help() -> None:
    """Help text must mention 127.0.0.1 or localhost or kernel sidecar concepts."""
    result = _run("--help")
    combined = result.stdout + result.stderr
    assert re.search(r"(127\.0\.0\.1|localhost|kernel|WebSocket)", combined, re.I)

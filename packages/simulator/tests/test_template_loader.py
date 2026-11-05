"""BE-10 — Block equation template loader tests.

Covers:
- All 10 v1 templates load without error.
- A fixture template with mismatched state_count raises with the offending path.
- A fixture template that throws on import is excluded; other templates still load.
"""

from __future__ import annotations

import pathlib
import textwrap

import pytest


def _import_loader():  # type: ignore[no-untyped-def]
    try:
        from simulator.equation_templates.loader import TemplateRegistry

        return TemplateRegistry
    except (ImportError, AttributeError):
        pytest.xfail("simulator.equation_templates.loader not yet implemented")


V1_TEMPLATES = [
    "signal.constant",
    "signal.step",
    "control.gain",
    "control.sum",
    "control.integrator",
    "control.derivative",
    "control.pid",
    "control.transfer_function",
    "control.saturation",
    "sinks.scope",
]


# ---------------------------------------------------------------------------
# Happy path — all 10 v1 templates load
# ---------------------------------------------------------------------------


def test_all_v1_templates_load() -> None:
    TemplateRegistry = _import_loader()
    registry = TemplateRegistry.discover()
    loaded_keys = set(registry.keys())
    for key in V1_TEMPLATES:
        assert key in loaded_keys, (
            f"Template {key!r} not found in registry. Loaded: {sorted(loaded_keys)}"
        )


def test_all_v1_templates_have_origin_path() -> None:
    """Each registry entry must expose an origin_path for error messages."""
    TemplateRegistry = _import_loader()
    registry = TemplateRegistry.discover()
    for key in V1_TEMPLATES:
        if key in registry:
            entry = registry[key]
            assert (
                hasattr(entry, "origin_path")
                or "origin_path" in entry.__dict__
                or hasattr(entry, "path")
            ), f"Template {key!r} has no origin_path"


# ---------------------------------------------------------------------------
# Mismatch raises with offending file path
# ---------------------------------------------------------------------------


def test_mismatched_state_count_raises(tmp_path: pathlib.Path) -> None:
    """A template whose state_vars() count doesn't match metadata raises at load time."""
    TemplateRegistry = _import_loader()

    # Write a broken equations.py that claims 0 states but metadata would say 1
    eq_dir = tmp_path / "blocks" / "control" / "bad_block"
    eq_dir.mkdir(parents=True)

    (eq_dir / "equations.py").write_text(
        textwrap.dedent("""
        class Equations:
            def state_vars(self, params):
                return []  # intentionally wrong
            def derivatives(self, t, inputs, state, params):
                return {}, {}
    """),
        encoding="utf-8",
    )

    (eq_dir / "metadata.yaml").write_text(
        textwrap.dedent("""
        name: control.bad_block
        version: 1
        category: control
        ports:
          inputs: []
          outputs: []
        params: []
        symbol:
          bbox: [60, 40]
          shape: rect
        behavior:
          causality: causal
          domain: signal
          state_count: 3
          equation_template: control.bad_block
    """),
        encoding="utf-8",
    )

    with pytest.raises(Exception) as exc_info:
        TemplateRegistry.discover(extra_roots=[tmp_path])

    error_msg = str(exc_info.value)
    assert "bad_block" in error_msg or str(eq_dir / "equations.py") in error_msg, (
        f"Error message doesn't mention the offending file: {error_msg!r}"
    )


# ---------------------------------------------------------------------------
# Broken import is isolated
# ---------------------------------------------------------------------------


def test_broken_import_isolated_other_templates_still_load(tmp_path: pathlib.Path) -> None:
    """An equations.py that raises on import must not poison the whole registry."""
    TemplateRegistry = _import_loader()

    broken_dir = tmp_path / "blocks" / "signal" / "broken"
    broken_dir.mkdir(parents=True)

    (broken_dir / "equations.py").write_text(
        "raise ImportError('intentional broken import')\n",
        encoding="utf-8",
    )
    (broken_dir / "metadata.yaml").write_text(
        textwrap.dedent("""
        name: signal.broken
        version: 1
        category: signal
        ports:
          inputs: []
          outputs: []
        params: []
        symbol:
          bbox: [60, 40]
          shape: rect
        behavior:
          causality: source
          domain: signal
          state_count: 0
          equation_template: signal.broken
    """),
        encoding="utf-8",
    )

    # Must not raise; registry loads the real templates and skips the broken one
    registry = TemplateRegistry.discover(extra_roots=[tmp_path])
    assert "signal.broken" not in registry
    # The real v1 templates (if blocks package is installed) must still be present
    # (only assert this if the blocks package was installed)
    try:
        import blocks  # noqa: F401

        for key in V1_TEMPLATES:
            assert key in registry, f"Real template {key!r} missing after broken import"
    except ImportError:
        pass  # blocks not yet installed — skip cross-check

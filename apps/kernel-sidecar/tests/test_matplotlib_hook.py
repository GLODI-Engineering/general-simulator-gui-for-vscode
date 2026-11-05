"""BE-08 — Matplotlib figure capture tests.

Covers:
- plt.show() does not open a window (Agg backend forced).
- exec `plt.plot([1,2,3]); plt.show()` yields one plot_ready with a valid PNG.
- 100 sequential plots don't grow process RSS beyond 50 MB above baseline.
"""

from __future__ import annotations

import base64

import pytest


def _import_hook():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.matplotlib_hook import MatplotlibHook

        return MatplotlibHook
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.matplotlib_hook not yet implemented")


def _import_namespace():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.namespace import Namespace

        return Namespace
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.namespace not yet implemented")


def _is_valid_png(data_b64: str) -> bool:
    """Return True iff the base64 string decodes to a PNG (magic bytes check)."""
    try:
        raw = base64.b64decode(data_b64)
    except Exception:
        return False
    png_magic = b"\x89PNG\r\n\x1a\n"
    return raw[:8] == png_magic


# ---------------------------------------------------------------------------
# No window popup
# ---------------------------------------------------------------------------


def test_agg_backend_forced() -> None:
    """matplotlib must use the Agg (non-interactive) backend."""
    import matplotlib

    _import_hook()  # ensure import doesn't blow up
    # After importing the hook the backend must be Agg
    assert matplotlib.get_backend().lower() == "agg", (
        f"Expected Agg backend, got {matplotlib.get_backend()!r}"
    )


# ---------------------------------------------------------------------------
# Single figure capture
# ---------------------------------------------------------------------------


def test_single_plot_produces_plot_ready() -> None:
    MatplotlibHook = _import_hook()
    Namespace = _import_namespace()
    ns = Namespace()
    hook = MatplotlibHook()
    hook.install()

    with hook.capture_context(request_id="r1") as figures:
        ns.exec("import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()")

    assert len(figures) == 1, f"Expected 1 figure, got {len(figures)}"
    fig_entry = figures[0]
    assert fig_entry.get("format") == "png"
    assert _is_valid_png(fig_entry["data"]), "plot_ready data is not a valid PNG"


# ---------------------------------------------------------------------------
# Multiple figures in order
# ---------------------------------------------------------------------------


def test_multiple_figures_emitted_in_order() -> None:
    MatplotlibHook = _import_hook()
    Namespace = _import_namespace()
    ns = Namespace()
    hook = MatplotlibHook()
    hook.install()

    with hook.capture_context(request_id="r2") as figures:
        ns.exec(
            "import matplotlib.pyplot as plt\n"
            "for i in range(3):\n"
            "    plt.figure(); plt.plot([i]); plt.show()"
        )

    assert len(figures) == 3, f"Expected 3 figures, got {len(figures)}"
    for fig in figures:
        assert _is_valid_png(fig["data"])


# ---------------------------------------------------------------------------
# Memory leak check
# ---------------------------------------------------------------------------


def test_100_sequential_plots_no_rss_growth() -> None:
    """Figures must be closed after emission; RSS should not grow unboundedly."""
    import os

    MatplotlibHook = _import_hook()
    Namespace = _import_namespace()
    hook = MatplotlibHook()
    hook.install()

    def rss_kb() -> int:
        try:
            with open(f"/proc/{os.getpid()}/status") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        return int(line.split()[1])
        except FileNotFoundError:
            pass
        return 0

    ns = Namespace()
    baseline = rss_kb()

    for i in range(100):
        with hook.capture_context(request_id=f"loop-{i}") as figures:
            ns.exec("import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()")
        assert len(figures) == 1

    final = rss_kb()
    if baseline > 0 and final > 0:
        growth_mb = (final - baseline) / 1024
        assert growth_mb < 50, (
            f"RSS grew by {growth_mb:.1f} MB over 100 plots — likely a figure leak"
        )

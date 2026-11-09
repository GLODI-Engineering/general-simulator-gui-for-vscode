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


#: Plots run before measuring anything, to pay matplotlib's one-time costs.
_WARMUP_PLOTS = 20
#: Plots per measured block. Two blocks of this size are run.
_MEASURED_PLOTS = 100
#: What the *second* block may grow by. Chosen from both sides, measured:
#:
#:   figures closed properly       second block grows   0.7 MB
#:   figures left in pyplot's Gcf  second block grows  25.7 MB
#:
#: so 15 sits an order of magnitude above the healthy case and well under a real
#: leak, with room for allocator noise on a CI runner. The leaking figure was
#: produced on purpose to confirm this limit still catches it.
_SETTLED_GROWTH_LIMIT_MB = 15


def test_sequential_plots_do_not_leak_figures() -> None:
    """Figures must be closed after emission; RSS must stop growing once warm."""
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

    def plot_block(count: int, tag: str) -> None:
        for i in range(count):
            with hook.capture_context(request_id=f"{tag}-{i}") as figures:
                ns.exec("import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.show()")
            assert len(figures) == 1

    # Warm up first. Measuring from a cold start measured matplotlib's *import*,
    # not this hook: the very first plot costs ~68 MB on its own (backend init and
    # the font cache), which is 72% of the growth the old form attributed to a
    # leak. It also made the result depend on test ordering — whether some earlier
    # test had already imported matplotlib decided whether this one passed.
    plot_block(_WARMUP_PLOTS, "warmup")

    # Then two equal blocks. A leak grows by the same amount every block; a cache
    # grows once and flattens. Measured here: +11.4 MB for the first 100 plots
    # after warm-up and +0.7 MB for the next 100, which is the flattening shape,
    # not a leak. So the second block is the signal, and the first is allowed to
    # carry whatever caching is left.
    first_start = rss_kb()
    plot_block(_MEASURED_PLOTS, "first")
    second_start = rss_kb()
    plot_block(_MEASURED_PLOTS, "second")
    second_end = rss_kb()

    if first_start <= 0 or second_end <= 0:
        return  # no /proc on this platform; nothing to assert

    settled_growth_mb = (second_end - second_start) / 1024
    assert settled_growth_mb < _SETTLED_GROWTH_LIMIT_MB, (
        f"RSS grew by {settled_growth_mb:.1f} MB over the second block of "
        f"{_MEASURED_PLOTS} plots, after {_WARMUP_PLOTS + _MEASURED_PLOTS} had "
        "already run — caching has had every chance to settle, so this is a "
        "figure that is not being closed. "
        f"(First block grew {(second_start - first_start) / 1024:.1f} MB.)"
    )

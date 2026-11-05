"""XSPICE runtime bootstrap (BE-60).

ngspice's XSPICE codemodels (gain, int, d_dt, s_xfer, limit, ...) are
compiled into the binary's ``lib/ngspice/*.cm`` shared libraries but are not
loaded unless spinit both sets ``xspice_enabled`` and points ``codemodel``
at those ``.cm`` files with a working path. Two problems bite in practice:

1. The vendored spinit guards codemodel loading behind
   ``if $?xspice_enabled``, which is unset by default.
2. ngspice's own ``codemodel`` command cannot parse a path containing
   spaces — and a real-world install prefix (this repo's own checkout
   path, "Github Works/Électronique/...") can easily contain one.

``ensure_xspice_env`` generates a corrected spinit into a stable,
space-free cache directory (via a symlink to the real, possibly
space-containing codemodel directory) and returns the environment
override needed to make ngspice load it.
"""

from __future__ import annotations

import os
import pathlib


class XSpiceNotAvailableError(RuntimeError):
    """Raised when the resolved ngspice binary has no XSPICE codemodel
    libraries — i.e. it was not built with --enable-xspice."""


def _codemodel_dir(ngspice_path: pathlib.Path) -> pathlib.Path:
    # <prefix>/bin/ngspice -> <prefix>/lib/ngspice — same convention
    # path_discovery._validate_executable already uses for LD_LIBRARY_PATH.
    return ngspice_path.parent.parent / "lib" / "ngspice"


def _cache_root() -> pathlib.Path:
    xdg_data = os.environ.get("XDG_DATA_HOME")
    base = pathlib.Path(xdg_data) if xdg_data else pathlib.Path.home() / ".local" / "share"
    return base / "general-simulator" / "xspice-cache"


def ensure_xspice_env(
    ngspice_path: pathlib.Path, *, cache_root: pathlib.Path | None = None
) -> dict[str, str]:
    """Return an environment-variable override dict that makes XSPICE
    codemodels loadable when *ngspice_path* is run with it merged in.

    Raises :exc:`XSpiceNotAvailableError` if *ngspice_path* has no
    codemodel libraries at all, rather than silently producing a spinit
    that loads nothing (which would surface later as an opaque "Unknown
    model type" deep in ngspice's own output).
    """
    cm_dir = _codemodel_dir(ngspice_path)
    cm_files = sorted(cm_dir.glob("*.cm")) if cm_dir.is_dir() else []
    if not cm_files:
        raise XSpiceNotAvailableError(
            f"No XSPICE codemodel libraries (*.cm) found under {cm_dir!s}. "
            f"The ngspice binary at {ngspice_path!s} was likely built "
            f"without --enable-xspice."
        )

    root = cache_root if cache_root is not None else _cache_root()
    root.mkdir(parents=True, exist_ok=True)

    # A stable, space-free symlink to the real (possibly space-containing)
    # codemodel directory — only the argv string ngspice's `codemodel`
    # command parses needs to be space-free; the symlink target does not,
    # since the OS resolves it transparently.
    cm_link = root / "codemodels"
    if cm_link.is_symlink() or cm_link.exists():
        cm_link.unlink()
    cm_link.symlink_to(cm_dir)

    spinit_lines = [
        "set xspice_enabled",
        *(f"codemodel {cm_link / f.name}" for f in cm_files),
    ]
    spinit_path = root / "spinit"
    spinit_path.write_text("\n".join(spinit_lines) + "\n", encoding="utf-8")

    return {"SPICE_SCRIPTS": str(root)}

"""Entry point for the kernel-sidecar process (BE-01).

Usage:
    python -m kernel_sidecar --port <port> --token <hex> [--workdir <path>]

The sidecar binds only to 127.0.0.1. After a successful bind it prints
``KERNEL_READY port=<n> token=<hex>`` to stdout (BE-03) and then accepts
WebSocket connections.
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kernel_sidecar",
        description="General-simulator kernel sidecar — binds to 127.0.0.1 only.",
    )
    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help="TCP port to bind (use 0 for a random available port).",
    )
    parser.add_argument(
        "--token",
        required=True,
        help="Hex authentication token; must be the first WS message payload.",
    )
    parser.add_argument(
        "--workdir",
        default=None,
        help="Working directory for result files (defaults to XDG_DATA_HOME).",
    )
    parser.add_argument(
        "--connect-timeout",
        type=float,
        default=1.0,
        dest="connect_timeout",
        help="Exit if no client connects within this many seconds (0 = wait forever).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity. DEBUG also dumps per-request netlists/solver I/O.",
    )
    return parser


def main() -> int:
    import logging

    parser = _build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stderr,
    )

    try:
        from kernel_sidecar.server import run_server
    except (ImportError, AttributeError) as exc:
        print(f"Server not yet available: {exc}", file=sys.stderr)
        return 1

    asyncio.run(
        run_server(
            port=args.port,
            token=args.token,
            workdir=args.workdir,
            connect_timeout=args.connect_timeout,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""simulate IPC handler (BE-18).

Orchestrates: validate gsim → compile → solve → write → emit result.

handle_simulate returns immediately after registering the cancel token and
spawning a background task.  This keeps the message-receive loop free so
that simulate_cancel can be dispatched while the solve is running.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import pathlib
from collections.abc import Awaitable, Callable
from typing import Any

import numpy as np

from kernel_sidecar.config.settings import default_settings_path
from kernel_sidecar.ipc.envelope import (
    Message,
    MessageType,
    WaveformDone,
    encode_waveform_chunk_frame,
)

logger = logging.getLogger(__name__)


def _is_circuit_schematic_legacy(ir1: Any) -> bool:
    """Lazy-imported wrapper — only ever called on the explicit-legacy-solver path."""
    from simulator.compiler.spice_netlist_writer import is_circuit_schematic

    return bool(is_circuit_schematic(ir1))


async def handle_simulate(ws: Any, msg: Message, ctx: Any) -> None:
    """Register cancel token and spawn the simulation as a background task."""
    request_id = msg.id
    payload = msg.payload
    logger.debug("handle_simulate entry — request_id=%s", request_id)

    gsim_doc = payload.get("model")
    direct_netlist = _normalize_netlist(payload.get("netlist"))
    if gsim_doc is None and direct_netlist is None:
        await _emit_error(
            ws, request_id, "MissingModel", "Payload missing 'model' or 'netlist' key."
        )
        return

    from simulator.solvers.protocol import CancelToken

    cancel_token = CancelToken()
    ctx.simulate_tokens[request_id] = cancel_token

    # Spawn the long-running work as a background task so the message-receive
    # loop is not blocked (allows simulate_cancel to arrive and be dispatched).
    # Store on ctx so the task is not garbage-collected while the simulation runs.
    task = asyncio.create_task(
        _do_simulate(ws, msg, ctx, cancel_token),
        name=f"simulate-{request_id}",
    )
    ctx.simulate_tasks[request_id] = task


async def _do_simulate(ws: Any, msg: Message, ctx: Any, cancel_token: Any) -> None:
    """Run the full simulation pipeline in a background task."""
    request_id = msg.id
    payload = msg.payload
    options_raw = _extract_options(payload)
    gsim_doc = payload.get("model")
    direct_netlist = _normalize_netlist(payload.get("netlist"))
    requested_solver = payload.get("solver")
    analysis_id_req: str | None = payload.get("analysis_id")  # BE-35

    logger.info(
        "simulate request %s — model=%s, netlist=%d chars, solver=%s",
        request_id,
        "yes" if gsim_doc else "no",
        len(direct_netlist) if isinstance(direct_netlist, str) else 0,
        requested_solver or "auto",
    )

    if gsim_doc is None and direct_netlist is None:
        logger.warning("simulate %s — missing model and netlist", request_id)
        await _emit_error(
            ws, request_id, "MissingModel", "Payload missing 'model' or 'netlist' key."
        )
        return

    import time as _time

    ctx.sim_progress = 0.0
    ctx.sim_message = "Compiling…"
    ctx.sim_started_at = _time.time()

    await ws.send(
        Message(
            id=request_id,
            type=MessageType.KERNEL_STATUS,
            payload={"state": "busy"},
        ).to_json()
    )

    try:
        from simulator.compiler.gsim_py_netlist import GsimPyNotAvailable, compile_gsim_document
        from simulator.postprocess import result_writer
        from simulator.solvers.general_simulator_solver import GeneralSimulatorSolver
        from simulator.solvers.protocol import SimulationError, SolverOptions

        # The old ir1/ir2/spice_netlist_writer/scipy_compiler pipeline (targets ngspice/
        # Xyce/SciPy, a different block taxonomy maintained by hand in
        # spice_netlist_writer.BLOCK_TO_SPICE) is bypassed entirely for a `model` payload.
        # gsim-core's own compile registry is the real, single source of truth for what a
        # general-simulator-only catalogue document compiles to — see
        # simulator.compiler.gsim_py_netlist's own module doc comment. The three old
        # solvers stay reachable, but only via an *explicit* `solver=` request (kept for
        # side-by-side comparison / debugging, not the default path a real user takes).
        legacy_solver_requested = (requested_solver or "").lower() in (
            "ngspice",
            "xyce",
            "scipy",
        )

        ir1 = None
        selected_req = None
        if not isinstance(direct_netlist, str) and legacy_solver_requested:
            # Old pipeline, kept reachable only for an explicit solver= override — see the
            # module-level comment above `legacy_solver_requested`. Confirmed by hand that
            # gsim_loader's own schema validation rejects real general-simulator-only
            # documents outright (stale `net`-property requirement predating this
            # benchmark's own wire schema), so it is not safe to reuse even for shared,
            # solver-agnostic concerns like simulation-settings extraction — the bypass
            # path below does not call any of this.
            from simulator.compiler import gsim_loader, ir1_builder

            # Step 1: validate and load.
            try:
                doc = gsim_loader.load(gsim_doc)
            except (ValueError, TypeError) as exc:
                await _emit_error(ws, request_id, "ValidationError", str(exc))
                return

            # Step 2: compile.
            ir1 = ir1_builder.build(doc)

            # BE-35: extract simulation plan and dispatch by analysis_id.
            from simulator.compiler.simulation_extract import (
                analysis_request_to_options_dict,
                extract_simulation,
            )
            from simulator.solvers.protocol import UnsupportedAnalysisError

            try:
                if ir1.simulation.analyses:
                    plan = extract_simulation(ir1)
                    # Select the requested analysis or fall back to the plan default.
                    target_id = analysis_id_req if analysis_id_req is not None else plan.default_id
                    selected_req = next(
                        (r for r in plan.analyses if r.id == target_id),
                        plan.analyses[0] if plan.analyses else None,
                    )
                    if selected_req is not None:
                        req_opts = analysis_request_to_options_dict(selected_req)
                        # Plan provides base; IPC payload options_raw takes precedence.
                        options_raw = {**req_opts, **options_raw}
            except UnsupportedAnalysisError as exc:
                await _emit_error(ws, request_id, "UnsupportedAnalysisError", str(exc))
                return
            except Exception:
                # Extraction failure is non-fatal; fall through to payload options.
                logger.warning(
                    "extract_simulation failed for request %s", request_id, exc_info=True
                )

        t_start = float(options_raw.get("t_start", 0.0))
        t_end = float(options_raw.get("t_end", 10.0))
        n_samples = _resolve_n_samples(options_raw, t_start, t_end)

        options = SolverOptions(
            analysis_type=str(options_raw.get("analysis_type", "TRAN")),
            t_start=t_start,
            t_end=t_end,
            n_samples=n_samples,
            rtol=float(options_raw.get("rtol", 1e-6)),
            atol=float(options_raw.get("atol", 1e-9)),
            method=str(options_raw.get("method", "Radau")),
            ac_fstart=float(options_raw.get("ac_fstart", 1.0)),
            ac_fstop=float(options_raw.get("ac_fstop", 1e6)),
            ac_points=int(options_raw.get("ac_points", 100)),
            dc_source=str(options_raw.get("dc_source", "")),
            dc_start=float(options_raw.get("dc_start", 0.0)),
            dc_stop=float(options_raw.get("dc_stop", 5.0)),
            dc_step=float(options_raw.get("dc_step", 0.1)),
            uic=bool(options_raw.get("uic", False)),
        )

        # BE-54: analysis types whose signals stream live (chunked as points
        # are computed, not just after solve() returns) — the same set that
        # already received post-solve chunked delivery (BE-49); AC/DC/OP need
        # whole-curve postprocessing (Bode margins, dc_op_table) that isn't
        # point-wise safe to compute incrementally, so they keep today's
        # deliver-at-completion behavior.
        analysis_type_str = str(options_raw.get("analysis_type", "TRAN")).upper()
        streams_live = analysis_type_str not in ("AC", "DC", "OP")

        loop = asyncio.get_running_loop()

        # BE-54: signal names that received at least one live chunk during the
        # solve — _emit_waveform_stream skips re-sending their (now
        # redundant) full chunk data afterward but still sends WaveformDone
        # for them, since that carries the manifest metadata the frontend
        # needs regardless of how the data arrived.
        live_signal_names: set[str] = set()

        # BE-54: on_partial runs on the solver's worker thread and only
        # *schedules* each chunk send via call_soon_threadsafe — it doesn't
        # wait for the send to actually reach the socket. Without tracking
        # and draining these tasks, WaveformDone (sent right after solve()
        # returns) can race ahead of the last few in-flight chunks, so the
        # frontend marks the signal "done" and re-fetches authoritative data
        # while stale chunks are still arriving and corrupting it via
        # appendChunk.
        #
        # This is a set, not a list: each task discards itself via the
        # done-callback the instant it finishes, so memory stays bounded to
        # whatever's currently in flight instead of accumulating a reference
        # to every chunk-send task for the whole run (tens of thousands for
        # a large simulation). What's left in the set at solve-completion is
        # gathered once, right before Step 4 below, to close the race.
        pending_live_tasks: set[asyncio.Task[None]] = set()

        async def _send_live_chunk(name: str, x: Any, values: Any) -> None:
            # A single on_partial callback can carry many thousands of new
            # points (ngspice/Xyce write fast; the poll loop only samples
            # every ~0.2s), so this must sub-chunk the same way
            # _emit_waveform_stream does — otherwise a single WAVEFORM_CHUNK
            # message can exceed the websocket server's frame size limit.
            # BE-56: binary-encoded (not JSON) — see encode_waveform_chunk_frame
            # for why: profiling showed JSON encoding of large float lists
            # was the dominant cost of live streaming, not the solve itself.
            # request_id doubles as sim_id here because on_partial is only
            # ever wired for the direct-netlist SPICE solve calls below,
            # which always pass sim_id=request_id.
            n = len(values)
            start = 0
            while start < n:
                end = min(start + _WAVEFORM_CHUNK_STEPS, n)
                await ws.send(
                    encode_waveform_chunk_frame(request_id, name, x[start:end], values[start:end])
                )
                start = end
                await asyncio.sleep(0)

        def _create_and_track(name: str, x: Any, values: Any) -> None:
            task = loop.create_task(_send_live_chunk(name, x, values))
            pending_live_tasks.add(task)
            task.add_done_callback(pending_live_tasks.discard)

        def _schedule_live_chunk(name: str, x: Any, values: Any) -> None:
            loop.call_soon_threadsafe(_create_and_track, name, x, values)

        def on_partial(partial: Any) -> None:
            for name, values in partial.signal_values.items():
                live_signal_names.add(name)
                _schedule_live_chunk(name, partial.x, values)

        async def emit_progress(frac: float) -> None:
            ctx.sim_progress = frac
            await ws.send(
                Message(
                    id=request_id,
                    type=MessageType.SIMULATE_PROGRESS,
                    payload={
                        "frac": round(min(1.0, max(0.0, frac)), 4),
                        "message": ctx.sim_message,
                    },
                ).to_json()
            )

        def progress_cb(frac: float) -> None:
            ctx.sim_progress = frac
            ctx.sim_message = "Solving…"
            loop.call_soon_threadsafe(lambda: loop.create_task(emit_progress(frac)))

        preferred_paths = _load_preferred_solver_paths(default_settings_path())

        # Step 3: solve.
        ctx.sim_message = "Solving…"
        logger.debug(
            "simulate %s — options: analysis=%s t_end=%g n_samples=%d",
            request_id,
            options.analysis_type,
            options.t_end,
            options.n_samples,
        )
        try:
            backend: Any
            node_domains: dict[str, str] | None = None
            if isinstance(direct_netlist, str):
                from simulator.solvers.ngspice_solver import NgspiceSolver
                from simulator.solvers.xyce_solver import XyceSolver

                requested = str(requested_solver or "ngspice").lower()
                logger.debug(
                    "simulate %s — direct netlist path, requested solver: %s",
                    request_id,
                    requested,
                )
                if requested == "xyce":
                    if preferred_paths.get("xyce") is not None:
                        backend = XyceSolver(preferred_paths["xyce"])
                    else:
                        backend = XyceSolver.from_discovery()
                    if backend is None:
                        raise SimulationError("Requested solver 'xyce' is not available.")
                else:
                    if preferred_paths.get("ngspice") is not None:
                        backend = NgspiceSolver(preferred_paths["ngspice"])
                        logger.debug(
                            "simulate %s — using ngspice at configured path: %s",
                            request_id,
                            preferred_paths["ngspice"],
                        )
                    else:
                        backend = NgspiceSolver.from_discovery()
                        if backend is not None:
                            logger.debug(
                                "simulate %s — discovered ngspice at: %s",
                                request_id,
                                backend.ngspice_path,
                            )
                    if backend is None:
                        logger.error("simulate %s — ngspice not found on system", request_id)
                        raise SimulationError("Requested solver 'ngspice' is not available.")
                logger.debug("simulate %s — launching %s solve…", request_id, backend.name)
                bundle = await _run_with_heartbeat(
                    loop,
                    lambda: backend.solve(
                        direct_netlist,
                        sim_id=request_id,
                        options=options,
                        cancel=cancel_token,
                        on_partial=on_partial if streams_live else None,
                    ),
                    emit_progress,
                )
            elif not legacy_solver_requested:
                # The new default path (BE-72-equivalent bypass): compile straight from the
                # raw `.gsim_sch` document via gsim-core's own compile registry, run the
                # real `general-simulator` binary. See the module-level comment above
                # `legacy_solver_requested`.
                if gsim_doc is None:
                    await _emit_error(
                        ws, request_id, "MissingModel", "Payload missing 'model' key."
                    )
                    return
                try:
                    netlist = compile_gsim_document(gsim_doc)
                except GsimPyNotAvailable as exc:
                    await _emit_error(ws, request_id, "SolverUnavailable", str(exc))
                    return
                except Exception as exc:  # gsim-tools' own typed compile errors
                    await _emit_error(ws, request_id, "CompileError", str(exc))
                    return

                backend = GeneralSimulatorSolver.from_discovery()
                if backend is None:
                    raise SimulationError(
                        "general-simulator binary not found. Build it: see "
                        "packages/simulator/src/simulator/solvers/"
                        "general_simulator_solver.py's own module doc comment."
                    )
                logger.debug("simulate %s — launching %s solve…", request_id, backend.name)
                bundle = await _run_with_heartbeat(
                    loop,
                    lambda: backend.solve(
                        netlist,
                        sim_id=request_id,
                        options=options,
                        cancel=cancel_token,
                        on_partial=on_partial if streams_live else None,
                    ),
                    emit_progress,
                )
            elif ir1 is not None and _is_circuit_schematic_legacy(ir1):
                from simulator.compiler.spice_netlist_writer import (
                    compute_node_domains,
                    write_netlist,
                )
                from simulator.selection import select_backend

                # Use the AnalysisRequest from the simulation plan when available
                # (triggers the v2 netlist writer which handles physical-electrical types).
                # Fall back to SolverOptions for v1-format models without an analysis plan.
                netlist = write_netlist(ir1, selected_req if selected_req is not None else options)
                node_domains = compute_node_domains(ir1)
                backend = select_backend(
                    ir1,
                    intent="transient",
                    preferred_paths=preferred_paths,
                    solver=requested_solver,
                )
                bundle = await _run_with_heartbeat(
                    loop,
                    lambda: backend.solve(
                        netlist,
                        sim_id=request_id,
                        options=options,
                        cancel=cancel_token,
                        on_partial=on_partial if streams_live else None,
                    ),
                    emit_progress,
                )
            else:
                from simulator.compiler import ir2_lowering, scipy_compiler
                from simulator.selection import select_backend

                if ir1 is None:
                    await _emit_error(
                        ws, request_id, "MissingModel", "Payload missing 'model' key."
                    )
                    return
                try:
                    ir2 = ir2_lowering.lower(ir1)
                except ValueError as exc:
                    await _emit_error(ws, request_id, "CompileError", str(exc))
                    return

                backend = select_backend(
                    ir2,
                    preferred_paths=preferred_paths,
                    solver=requested_solver,
                )
                compiled = scipy_compiler.compile(ir2)
                bundle = await loop.run_in_executor(
                    None,
                    lambda: backend.solve(
                        compiled,
                        (t_start, t_end),
                        options,
                        progress=progress_cb,
                        cancel=cancel_token,
                    ),
                )
        except InterruptedError:
            await _emit_error(ws, request_id, "Cancelled", "Simulation was cancelled.")
            return
        except Exception as exc:
            logger.exception("Solver error for request %s", request_id)
            await _emit_error(ws, request_id, type(exc).__name__, str(exc))
            return

        if cancel_token.is_cancelled:
            await _emit_error(ws, request_id, "Cancelled", "Simulation was cancelled.")
            return

        # BE-54: drain every scheduled live chunk send before writing results
        # or emitting WaveformDone/SIMULATE_RESULT — otherwise a straggling
        # chunk from the tail of the solve can arrive at the frontend after
        # it already considers the signal complete (see pending_live_tasks
        # above).
        if pending_live_tasks:
            await asyncio.gather(*pending_live_tasks)

        elapsed_solve = _time.time() - ctx.sim_started_at if ctx.sim_started_at else 0
        logger.info(
            "simulate %s — solve complete in %.2fs, %d signals, %d points",
            request_id,
            elapsed_solve,
            len(bundle.signals),
            getattr(bundle, "n_points", len(bundle.t) if hasattr(bundle, "t") else 0),
        )

        # Step 4: write results (BE-47: annotate signals with metadata before write).
        ctx.sim_message = "Writing results…"
        workdir = pathlib.Path(ctx.workdir)
        try:
            annotated = _annotate_bundle(bundle, options, node_domains=node_domains)
            result_writer.write(annotated, workdir, overwrite=True)
            logger.debug(
                "simulate %s — results written to %s",
                request_id,
                workdir / "results" / annotated.sim_id,
            )
        except Exception as exc:
            logger.exception("Result write error")
            await _emit_error(ws, request_id, "WriteError", str(exc))
            return

        manifest_url = f"/results/{annotated.sim_id}/manifest.json"

        # BE-49/BE-54: emit waveform_chunk / waveform_done for transient (and
        # noise) analyses. AC and DC deliver their results entirely via
        # SIMULATE_RESULT. Signals that already streamed live via on_partial
        # during the solve (live_signal_names) skip re-sending their now-
        # redundant chunk data here — but still get a WaveformDone so the
        # frontend receives the final manifest metadata regardless of
        # whether the data arrived live or only at completion (e.g. the
        # scipy backend, which has no live tailer).
        if streams_live:
            await _emit_waveform_stream(
                ws, request_id, annotated, skip_chunks_for=live_signal_names
            )

        # BE-50: build dc_op_table payload when present (OP analysis only).
        dc_op_payload: list[dict[str, object]] | None = None
        if annotated.dc_op_table is not None:
            dc_op_payload = [
                {
                    "node_or_branch": entry.node_or_branch,
                    "quantity": entry.quantity,
                    "value": entry.value,
                    "unit": entry.unit,
                }
                for entry in annotated.dc_op_table
            ]

        simulate_result_payload: dict[str, object] = {
            "sim_id": annotated.sim_id,
            "t_start": annotated.t_start,
            "t_end": annotated.t_end,
            "n_points": annotated.n_points,
            "manifest_url": manifest_url,
            "signals": [
                {
                    "name": sig.name,
                    "block_id": sig.block_id,
                    "port_id": sig.port_id,
                    "dtype": "float32",
                    "shape": list(sig.data.shape),
                    "url": (
                        f"/results/{annotated.sim_id}/signals/{sig.block_id}__{sig.port_id}.npy"
                    ),
                    # BE-47 metadata fields
                    "analysis": sig.analysis,
                    "quantity": sig.quantity,
                    "unit": sig.unit,
                    "domain": sig.domain,
                    **({"swept_param": sig.swept_param} if sig.swept_param is not None else {}),
                }
                for sig in annotated.signals
            ],
            "status": "ok",
        }
        if dc_op_payload is not None:
            simulate_result_payload["dc_op_table"] = dc_op_payload

        # BE-51: attach bode_margins for AC runs.
        if annotated.bode_margins is not None:
            simulate_result_payload["bode_margins"] = annotated.bode_margins

        await ws.send(
            Message(
                id=request_id,
                type=MessageType.SIMULATE_RESULT,
                payload=simulate_result_payload,
            ).to_json()
        )

    finally:
        ctx.simulate_tokens.pop(request_id, None)
        ctx.simulate_tasks.pop(request_id, None)
        ctx.sim_progress = 0.0
        ctx.sim_message = ""
        ctx.sim_started_at = None
        await ws.send(
            Message(
                id=request_id,
                type=MessageType.KERNEL_STATUS,
                payload={"state": "idle"},
            ).to_json()
        )


async def handle_simulate_cancel(ws: Any, msg: Message, ctx: Any) -> None:
    """Handle a simulate_cancel message."""
    target_id = msg.payload.get("target_id", msg.id)
    token = ctx.simulate_tokens.get(target_id)
    if token is not None:
        token.cancel()


async def _emit_error(ws: Any, request_id: str, exc_type: str, message: str) -> None:
    await ws.send(
        Message(
            id=request_id,
            type=MessageType.SIMULATE_RESULT,
            payload={
                "status": "error",
                "exc_type": exc_type,
                "message": message,
                "signals": [],
            },
        ).to_json()
    )


# Analysis option keys the frontend spreads at the top level of the simulate
# payload (see apps/frontend SimulateRequest / toAnalysisPayload).  The backend
# historically read them from a nested ``options`` dict; we accept both so that
# real frontend requests (top level) and existing tests (nested) both work.
_ANALYSIS_OPTION_KEYS = (
    "analysis_type",
    "t_start",
    "t_end",
    "t_step",
    "n_samples",
    "rtol",
    "atol",
    "method",
    "ac_fstart",
    "ac_fstop",
    "ac_points",
    "dc_source",
    "dc_start",
    "dc_stop",
    "dc_step",
    "uic",
)


def _extract_options(payload: dict[str, Any]) -> dict[str, Any]:
    """Merge top-level analysis fields with an explicit nested ``options`` dict.

    The explicit ``options`` dict (if present) takes precedence.
    """
    top_level = {k: payload[k] for k in _ANALYSIS_OPTION_KEYS if k in payload}
    nested = payload.get("options") or {}
    return {**top_level, **nested}


def _resolve_n_samples(options_raw: dict[str, Any], t_start: float, t_end: float) -> int:
    """Resolve the transient sample count.

    Honors an explicit ``n_samples``; otherwise derives it from the requested
    ``t_step`` time resolution; otherwise falls back to the default.
    """
    if options_raw.get("n_samples") is not None:
        return int(options_raw["n_samples"])
    t_step = options_raw.get("t_step")
    if t_step:
        try:
            step = float(t_step)
            if step > 0:
                return max(2, round((t_end - t_start) / step) + 1)
        except (TypeError, ValueError):
            pass
    return 3000


# Waveform streaming constants (BE-49).
# Chunks are emitted every _WAVEFORM_CHUNK_STEPS samples or every
# _WAVEFORM_CHUNK_MS milliseconds wall-clock, whichever comes first.
# Only the transient analysis path emits chunks; AC and DC use SIMULATE_RESULT only.
_WAVEFORM_CHUNK_STEPS = 1000
_WAVEFORM_CHUNK_MS = 50.0

# Progress heartbeat for opaque blocking SPICE solves.
# ngspice / Xyce run as blocking subprocesses with no per-step callback, so we
# surface a time-based indeterminate progress that climbs toward a ceiling and
# snaps to 1.0 on completion, instead of leaving the UI bar pinned at 0.
_PROGRESS_HEARTBEAT_INTERVAL_S = 0.4
_PROGRESS_TIME_CONSTANT_S = 6.0
_PROGRESS_CEILING = 0.95


async def _run_with_heartbeat(
    loop: asyncio.AbstractEventLoop,
    fn: Callable[[], Any],
    emit_progress: Callable[[float], Awaitable[None]],
) -> Any:
    """Run a blocking solve in the executor while emitting heartbeat progress.

    Emits 0.0 at launch, an asymptotic fraction (approaching _PROGRESS_CEILING)
    every heartbeat interval while the solve runs, and 1.0 on success. Solver
    exceptions propagate to the caller; no terminal progress is emitted on error.
    """
    future = loop.run_in_executor(None, fn)
    start = loop.time()
    await emit_progress(0.0)
    while True:
        done, _pending = await asyncio.wait({future}, timeout=_PROGRESS_HEARTBEAT_INTERVAL_S)
        if done:
            break
        elapsed = loop.time() - start
        frac = _PROGRESS_CEILING * (1.0 - math.exp(-elapsed / _PROGRESS_TIME_CONSTANT_S))
        await emit_progress(frac)
    result = future.result()
    await emit_progress(1.0)
    return result


async def _emit_waveform_stream(
    ws: Any,
    request_id: str,
    annotated: Any,
    skip_chunks_for: set[str] | None = None,
) -> None:
    """Emit waveform_chunk + waveform_done IPC messages for each transient signal.

    Chunks the signal array into windows of at most _WAVEFORM_CHUNK_STEPS samples,
    yielding control after each send so the event loop stays responsive (BE-49).
    Called only for transient (and noise) analyses; AC and DC callers must not
    invoke this function.

    *skip_chunks_for* (BE-54) names signals that already streamed live via
    on_partial during the solve — their chunk data is skipped here (it would
    otherwise duplicate onto the frontend's already-complete cache), but
    WaveformDone is still sent for them so the frontend gets the final
    manifest metadata (analysis/quantity/unit/url) regardless of delivery
    path.
    """
    time_vec: Any = getattr(annotated, "time", getattr(annotated, "t", None))
    skip_chunks_for = skip_chunks_for or set()

    for sig in annotated.signals:
        if sig.name not in skip_chunks_for:
            data = np.asarray(sig.data)
            n = len(data)
            chunk_start = 0
            has_time = time_vec is not None and len(time_vec) >= n

            while chunk_start < n:
                chunk_end = min(chunk_start + _WAVEFORM_CHUNK_STEPS, n)
                x_slice = (
                    np.asarray(time_vec[chunk_start:chunk_end])
                    if has_time
                    else np.zeros(chunk_end - chunk_start)
                )
                await ws.send(
                    encode_waveform_chunk_frame(
                        annotated.sim_id, sig.name, x_slice, data[chunk_start:chunk_end]
                    )
                )
                chunk_start = chunk_end
                # Yield to the event loop between chunks so websocket sends and
                # other messages are processed without blocking.
                await asyncio.sleep(0)

        # Build the manifest entry for waveform_done (same schema as BE-47 manifest).
        manifest_entry: dict[str, object] = {
            "name": sig.name,
            "block_id": sig.block_id,
            "port_id": sig.port_id,
            "analysis": sig.analysis,
            "quantity": sig.quantity,
            "unit": sig.unit,
            "domain": sig.domain,
            "dtype": "float32",
            "shape": list(sig.data.shape),
            "url": (f"results/{annotated.sim_id}/signals/{sig.block_id}__{sig.port_id}.npy"),
        }
        if sig.swept_param is not None:
            manifest_entry["swept_param"] = sig.swept_param

        done = WaveformDone(signal_id=sig.name, manifest_entry=manifest_entry)
        await ws.send(
            Message(
                id=request_id,
                type=MessageType.WAVEFORM_DONE,
                payload={
                    "signal_id": done.signal_id,
                    "manifest_entry": done.manifest_entry,
                },
            ).to_json()
        )
        await asyncio.sleep(0)


def _annotate_bundle(
    proto_bundle: Any,
    options: Any,
    *,
    node_domains: dict[str, str] | None = None,
) -> Any:
    """Convert a protocol ResultBundle to an annotated result_writer.ResultBundle.

    Infers analysis/quantity/unit/domain for each signal from the solver options
    and SPICE signal-name conventions (BE-47).  For AC analysis each signal is
    emitted twice — once tagged "ac_mag" and once "ac_phase" — because the
    frontend renders magnitude and phase on separate axes.  For OP analysis
    (BE-50) the signals are collected into dc_op_table instead of the waveform
    signals array.

    ``node_domains`` (BE-63), when given, overrides the SPICE-name-prefix
    quantity/unit guess for any node that
    ``spice_netlist_writer.compute_node_domains`` says originated from a
    signal-flow (not physical-electrical) wire — see
    ``result_writer.infer_signal_meta``.
    """
    from simulator.postprocess.bode_margins import BodeMargins, compute_bode_margins
    from simulator.postprocess.result_writer import (
        DcOpEntry,
        SignalArray,
        infer_signal_meta,
    )
    from simulator.postprocess.result_writer import (
        ResultBundle as WriterBundle,
    )

    analysis_type: str = getattr(options, "analysis_type", "TRAN")
    is_ac = analysis_type.upper() == "AC"
    is_op = analysis_type.upper() == "OP"
    dc_source: str = getattr(options, "dc_source", "") or ""

    signals: list[SignalArray] = []
    dc_op_table: list[DcOpEntry] | None = None
    proto_signals = getattr(proto_bundle, "signals", [])

    if is_op:
        # BE-50: for OP analysis each solver signal is a scalar annotation
        # (node voltage or branch current), not a time series.  Pack them into
        # dc_op_table and leave the signals array empty.
        dc_op_table = []
        for sig in proto_signals:
            sig_name: str = getattr(sig, "name", f"{sig.block_id}.{sig.port_id}")
            _analysis, quantity, unit, _domain = infer_signal_meta(
                sig_name, analysis_type, node_domains=node_domains
            )
            flat = np.asarray(sig.data).ravel()
            value: float = float(flat[0]) if len(flat) > 0 else 0.0
            dc_op_table.append(
                DcOpEntry(
                    node_or_branch=sig_name,
                    quantity=quantity,
                    value=value,
                    unit=unit,
                )
            )
    else:
        for sig in proto_signals:
            name: str = getattr(sig, "name", f"{sig.block_id}.{sig.port_id}")
            analysis, quantity, unit, domain = infer_signal_meta(
                name, analysis_type, node_domains=node_domains
            )

            swept_param: str | None = (
                dc_source if analysis_type.upper() == "DC" and dc_source else None
            )

            if is_ac:
                # Emit magnitude and phase pairs. ngspice's binary raw parser
                # (parse_ngspice_raw) returns genuine complex data for AC
                # analyses (Flags: complex) — this correctly computes real
                # magnitude/phase from it. The zero-filled phase fallback
                # below only fires for solver paths that don't yet produce
                # complex data (e.g. Xyce's .PRINT AC PRN columns, which are
                # already-split real-valued magnitude and don't round-trip
                # phase through this code path today).
                data = sig.data
                if np.iscomplexobj(data):
                    mag_data = np.abs(data).astype(np.float32)
                    phase_data = np.angle(data, deg=True).astype(np.float32)
                else:
                    mag_data = data.astype(np.float32)
                    phase_data = np.zeros_like(mag_data)

                signals.append(
                    SignalArray(
                        name=name,
                        block_id=sig.block_id,
                        port_id=sig.port_id,
                        data=mag_data,
                        analysis="ac_mag",
                        quantity=quantity,
                        unit=unit,
                        domain="frequency",
                    )
                )
                signals.append(
                    SignalArray(
                        name=f"{name}_phase",
                        block_id=sig.block_id,
                        port_id=f"{sig.port_id}_phase",
                        data=phase_data,
                        analysis="ac_phase",
                        quantity="phase",
                        unit="°",
                        domain="frequency",
                    )
                )
            else:
                signals.append(
                    SignalArray(
                        name=name,
                        block_id=sig.block_id,
                        port_id=sig.port_id,
                        data=sig.data,
                        analysis=analysis,
                        quantity=quantity,
                        unit=unit,
                        domain=domain,
                        swept_param=swept_param,
                    )
                )

    # BE-51: compute Bode margins for AC analyses.
    bode_margins_dict: dict[str, object] | None = None
    if is_ac:
        # Frequency axis is stored in the time vector for AC analyses.
        freq_vec = getattr(proto_bundle, "t", getattr(proto_bundle, "time", np.empty(0)))
        # Find the first ac_mag and ac_phase signal pair.
        mag_sig = next((s for s in signals if s.analysis == "ac_mag"), None)
        phase_sig = next((s for s in signals if s.analysis == "ac_phase"), None)
        if mag_sig is not None and len(freq_vec) == len(mag_sig.data):
            freq_arr = np.asarray(freq_vec, dtype=np.float64)
            mag_db_arr = 20.0 * np.log10(
                np.maximum(np.asarray(mag_sig.data, dtype=np.float64), 1e-300)
            )
            phase_arr = (
                np.asarray(phase_sig.data, dtype=np.float64)
                if phase_sig is not None
                else np.zeros_like(mag_db_arr)
            )
            try:
                margins: BodeMargins = compute_bode_margins(freq_arr, mag_db_arr, phase_arr)
                bode_margins_dict = {
                    "gain_margin_db": margins.gain_margin_db,
                    "phase_margin_deg": margins.phase_margin_deg,
                    "delay_margin_s": margins.delay_margin_s,
                    "gain_crossover_hz": margins.gain_crossover_hz,
                    "phase_crossover_hz": margins.phase_crossover_hz,
                    "bandwidth_3db_hz": margins.bandwidth_3db_hz,
                }
            except Exception:
                logger.warning("Bode margin computation failed", exc_info=True)

    t = getattr(proto_bundle, "t", getattr(proto_bundle, "time", np.empty(0)))
    return WriterBundle(
        sim_id=proto_bundle.sim_id,
        t_start=proto_bundle.t_start,
        t_end=proto_bundle.t_end,
        time=t,
        signals=signals,
        n_points=getattr(proto_bundle, "n_points", len(t)),
        dc_op_table=dc_op_table,
        bode_margins=bode_margins_dict,
    )


def _normalize_netlist(netlist: Any) -> str | None:
    """Return a non-empty netlist string, or None for missing/blank input."""
    if isinstance(netlist, str) and netlist.strip() != "":
        return netlist
    return None


def _load_preferred_solver_paths(settings_path: pathlib.Path) -> dict[str, pathlib.Path]:
    if not settings_path.exists():
        return {}
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    solvers = data.get("solvers", {})
    result: dict[str, pathlib.Path] = {}
    for solver_name in ("ngspice", "xyce"):
        solver_path = (solvers.get(solver_name) or {}).get("path")
        if solver_path:
            result[solver_name] = pathlib.Path(solver_path)
    return result

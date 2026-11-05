from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pytest

from kernel_sidecar.ipc.envelope import MessageType, decode_waveform_chunk_frame
from kernel_sidecar.ipc.handlers import simulate as simulate_handler
from simulator.postprocess.result_writer import ResultBundle, SignalArray

pytestmark = pytest.mark.asyncio


class _FakeWs:
    """Records every send() — binary (waveform_chunk) frames are decoded into
    a JSON-shaped dict so existing assertions can treat all messages
    uniformly; text (JSON) frames are decoded as before.
    """

    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def send(self, raw: str | bytes) -> None:
        if isinstance(raw, bytes):
            header, x, values = decode_waveform_chunk_frame(raw)
            self.messages.append(
                {
                    "type": MessageType.WAVEFORM_CHUNK.value,
                    "id": header["sim_id"],
                    "payload": {
                        "signal_id": header["signal_id"],
                        "x": x.tolist(),
                        "values": values.tolist(),
                    },
                }
            )
        else:
            self.messages.append(json.loads(raw))


async def test_transient_stream_emits_multiple_chunks_then_done() -> None:
    n = 5000
    t = np.linspace(0.0, 1.0, n, dtype=np.float64)
    y = np.linspace(-1.0, 1.0, n, dtype=np.float32)

    bundle = ResultBundle(
        sim_id="wf-tran",
        t_start=0.0,
        t_end=1.0,
        time=t,
        n_points=n,
        signals=[
            SignalArray(
                name="scope.out",
                block_id="scope",
                port_id="out",
                data=y,
                analysis="transient",
                quantity="voltage",
                unit="V",
                domain="time",
            )
        ],
    )

    ws = _FakeWs()
    await simulate_handler._emit_waveform_stream(ws, "req-1", bundle)

    chunks = [m for m in ws.messages if m["type"] == MessageType.WAVEFORM_CHUNK.value]
    done = [m for m in ws.messages if m["type"] == MessageType.WAVEFORM_DONE.value]

    assert len(chunks) >= 2
    assert len(done) == 1

    concatenated: list[float] = []
    for msg in chunks:
        payload = msg["payload"]
        concatenated.extend(payload["values"])
    np.testing.assert_allclose(np.asarray(concatenated, dtype=np.float32), y)

    done_entry = done[0]["payload"]["manifest_entry"]
    for field in ("analysis", "quantity", "unit", "domain", "name", "url"):
        assert field in done_entry


async def test_ac_annotate_bundle_generates_ac_pairs_and_no_transient_tag() -> None:
    @dataclass
    class _ProtoSig:
        block_id: str
        port_id: str
        name: str
        data: np.ndarray

    @dataclass
    class _ProtoBundle:
        sim_id: str
        t_start: float
        t_end: float
        t: np.ndarray
        signals: list[_ProtoSig]
        n_points: int

    @dataclass
    class _Options:
        analysis_type: str = "AC"
        dc_source: str = ""

    proto = _ProtoBundle(
        sim_id="wf-ac",
        t_start=1.0,
        t_end=1000.0,
        t=np.array([1.0, 10.0, 100.0], dtype=np.float64),
        signals=[
            _ProtoSig(
                block_id="ac",
                port_id="out",
                name="V(out)",
                data=np.array([1.0, 0.5, 0.1], dtype=np.float32),
            )
        ],
        n_points=3,
    )

    annotated = simulate_handler._annotate_bundle(proto, _Options())
    analyses = [sig.analysis for sig in annotated.signals]
    assert analyses == ["ac_mag", "ac_phase"]
    assert "transient" not in analyses

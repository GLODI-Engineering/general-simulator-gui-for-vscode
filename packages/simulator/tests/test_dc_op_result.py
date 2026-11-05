from __future__ import annotations

import json
import pathlib

import numpy as np

from simulator.postprocess.result_writer import DcOpEntry, ResultBundle, write


def test_dc_op_manifest_contains_dc_op_table(tmp_path: pathlib.Path) -> None:
    bundle = ResultBundle(
        sim_id="be50-op",
        t_start=0.0,
        t_end=0.0,
        time=np.array([0.0], dtype=np.float64),
        n_points=1,
        signals=[],
        dc_op_table=[
            DcOpEntry(node_or_branch="V(n1)", quantity="voltage", value=5.0, unit="V"),
            DcOpEntry(node_or_branch="V(n2)", quantity="voltage", value=3.3, unit="V"),
            DcOpEntry(node_or_branch="I(R1)", quantity="current", value=0.002, unit="A"),
        ],
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be50-op" / "manifest.json").read_text())

    assert "dc_op_table" in manifest
    assert len(manifest["dc_op_table"]) == 3
    for row in manifest["dc_op_table"]:
        assert isinstance(row["node_or_branch"], str)
        assert isinstance(row["quantity"], str)
        assert isinstance(row["unit"], str)
        assert isinstance(row["value"], float)


def test_transient_manifest_has_no_dc_op_table(tmp_path: pathlib.Path) -> None:
    from simulator.postprocess.result_writer import SignalArray

    t = np.linspace(0.0, 1.0, 4)
    bundle = ResultBundle(
        sim_id="be50-tran",
        t_start=0.0,
        t_end=1.0,
        time=t,
        n_points=len(t),
        signals=[
            SignalArray(
                name="scope.out",
                block_id="scope",
                port_id="out",
                data=np.linspace(0.0, 1.0, len(t), dtype=np.float32),
            )
        ],
    )

    write(bundle, tmp_path, overwrite=True)
    manifest = json.loads((tmp_path / "results" / "be50-tran" / "manifest.json").read_text())

    assert "dc_op_table" not in manifest

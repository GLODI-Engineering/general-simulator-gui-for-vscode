from __future__ import annotations

from gsim_model import ConnectivityGraph, ModelBuilder


def test_direct_wire_connectivity() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        id="r1",
        position=(0, 0),
    )
    r2 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        id="r2",
        position=(10, 0),
    )
    b.connect(r1.port("p2"), r2.port("p1"), kind="physical-electrical")

    graph = ConnectivityGraph.from_document(b.document)

    assert graph.is_connected(r1.port("p2"), r2.port("p1"))
    assert graph.net_of("r1", "p2") == graph.net_of("r2", "p1")
    path = graph.path(r1.port("p2"), r2.port("p1"))
    assert path is not None
    assert [hop.via for hop in path] == ["wire"]


def test_goto_from_is_a_transparent_hop() -> None:
    b = ModelBuilder.new("m1", "Test")
    src = b.add_block(
        "signal-flow.const",
        paradigm="signal-flow",
        domain="signal",
        id="src",
        position=(0, 0),
    )
    goto = b.add_block(
        "routing.goto",
        paradigm="routing",
        domain="signal",
        fidelity="n_a",
        id="goto1",
        position=(50, 0),
        params={"tag": "x", "visibility": "local"},
    )
    frm = b.add_block(
        "routing.from",
        paradigm="routing",
        domain="signal",
        fidelity="n_a",
        id="from1",
        position=(150, 0),
        params={"tag": "x"},
    )
    dst = b.add_block(
        "signal-flow.const",
        paradigm="signal-flow",
        domain="signal",
        id="dst",
        position=(200, 0),
    )
    b.connect(src.port("out"), goto.port("in"), kind="signal")
    b.connect(frm.port("out"), dst.port("in"), kind="signal")

    graph = ConnectivityGraph.from_document(b.document)

    # No direct wire between src and dst — connectivity only holds because
    # goto_from_resolve() bridges the matching Goto/From tag pair.
    assert graph.is_connected(src.port("out"), dst.port("in"))
    path = graph.path(src.port("out"), dst.port("in"))
    assert path is not None
    assert "goto_from" in [hop.via for hop in path]


def test_net_of_survives_a_later_union_reparenting_the_named_root() -> None:
    """Regression: found while auto-laying-out the power-electronics audit
    schemas (a block's "gnd"-tagged port resolved to a synthesized name
    instead of "gnd"). union-find's `parent[rb] = ra` always keeps the
    *first* argument's root as the new parent — so if a wire processed
    *after* the one carrying `net="gnd"` merges that already-named group
    in as the "rb" (losing) side, the pre-fix code's `_named_nets` key
    (recorded against the root at tag-time) goes stale: a later find()
    on any member resolves to the *new* merged root, which was never
    given the name, and net_of() silently fell back to a synthesized
    "root.block:root.port" string instead of "gnd".
    """
    b = ModelBuilder.new("m1", "Test")
    a = b.add_block(
        "physical_electrical.passive.resistor", paradigm="physical-network",
        domain="physical-electrical", id="a", position=(0, 0),
    )
    b_blk = b.add_block(
        "physical_electrical.passive.resistor", paradigm="physical-network",
        domain="physical-electrical", id="b", position=(10, 0),
    )
    c = b.add_block(
        "physical_electrical.passive.resistor", paradigm="physical-network",
        domain="physical-electrical", id="c", position=(20, 0),
    )
    d = b.add_block(
        "physical_electrical.passive.resistor", paradigm="physical-network",
        domain="physical-electrical", id="d", position=(30, 0),
    )
    # a.p2-b.p1 unioned first (root becomes the a.p2 endpoint), tagged
    # "gnd" against that root.
    b.connect(a.port("p2"), b_blk.port("p1"), kind="physical-electrical", net="gnd")
    # c.p2-d.p1 unioned next — an unrelated net (a component's two ports
    # are different circuit nodes, not connected to each other).
    b.connect(c.port("p2"), d.port("p1"), kind="physical-electrical")
    # c.p1-b.p1 unioned last, with "c.p1" (the *other* group) passed
    # first — this is exactly what reparents the already-"gnd"-tagged
    # root under a new parent.
    b.connect(c.port("p1"), b_blk.port("p1"), kind="physical-electrical")

    graph = ConnectivityGraph.from_document(b.document)

    assert graph.net_of("a", "p2") == "gnd"
    assert graph.net_of("b", "p1") == "gnd"
    assert graph.net_of("c", "p1") == "gnd"
    # c.p2/d.p1 are a genuinely different, unrelated net — must NOT pick
    # up the "gnd" name just because c.p1 (a different port on the same
    # block) happens to be on the gnd net.
    assert graph.net_of("c", "p2") != "gnd"
    assert graph.net_of("d", "p1") != "gnd"


def test_unrelated_ports_are_not_connected() -> None:
    b = ModelBuilder.new("m1", "Test")
    r1 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        id="r1",
        position=(0, 0),
    )
    r2 = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        id="r2",
        position=(10, 0),
    )
    graph = ConnectivityGraph.from_document(b.document)
    assert not graph.is_connected(r1.port("p1"), r2.port("p1"))
    assert graph.path(r1.port("p1"), r2.port("p1")) is None

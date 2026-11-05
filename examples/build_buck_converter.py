"""Author a cleanly laid-out buck converter .gsim_sch.

Every terminal is computed from the renderer's own geometry rather than typed
by hand, so the document is grid-exact by construction:

    SYMBOL_SCALE = 2, STUB_LEN = 20 = GRID

A two-terminal part with bbox [60, 40] placed at (X, Y) therefore has

    rotation 0    p (X - 20, Y + 40)      n (X + 140, Y + 40)   body 120x80
    rotation 90   p (X + 40, Y - 20)      n (X + 40, Y + 140)   body  80x120
    rotation 270  n (X + 40, Y - 20)      p (X + 40, Y + 140)   body  80x120

and the switch (bbox [60, 60]) has its power pair at offset 20 from the block
origin and its control pair at offset 60.
"""

import json
import pathlib
import sys

SCALE = 2
STUB = 20


def two_terminal(x, y, rotation, ports=("p", "n")):
    """Terminal points of a bbox-[60,40] part, keyed by its real port ids.

    `ports` is (first, second) in catalog order — left/right at rotation 0.
    A diode's are ("a", "k"), not ("p", "n"); naming them generically here
    produced wires pointing at ports that do not exist, which the canvas
    drops without a word.
    """
    first, second = ports
    if rotation == 0:
        return {first: (x - STUB, y + 40), second: (x + 140, y + 40)}
    if rotation == 90:
        return {first: (x + 40, y - STUB), second: (x + 40, y + 140)}
    if rotation == 270:
        return {second: (x + 40, y - STUB), first: (x + 40, y + 140)}
    raise ValueError(rotation)


def switch_terminals(x, y):
    """bbox [60,60]: power pair at offset 10, control pair at offset 30."""
    return {
        "p": (x - STUB, y + 20),
        "n": (x + 140, y + 20),
        "cp": (x - STUB, y + 60),
        "cn": (x + 140, y + 60),
    }


def block(bid, typ, pos, rotation=0, params=None, label=None):
    b = {
        "id": bid,
        "type": typ,
        "paradigm": "physical-network",
        "domain": "physical-electrical",
        "fidelity": "ideal",
        "position": list(pos),
        "rotation": rotation,
        "mirror": "none",
        "params": params or {},
        "ic": {},
    }
    if label:
        b["label"] = label
    return b


TOP = 140          # input / switch-node / output rail
BOTTOM = 540       # return rail

# --- placement (every coordinate a multiple of GRID=20) ---
V1 = (80, 240)     # rot 90, vertical on the left
S1 = (260, 120)    # rot 0,  on the top rail
V2 = (260, 320)    # rot 0,  gate drive, directly under the switch
D1 = (460, 260)    # rot 270, freewheel: cathode up to the switch node
L1 = (600, 100)    # rot 0,  on the top rail
C1 = (800, 260)    # rot 90, output filter
R1 = (980, 260)    # rot 90, load

v1 = two_terminal(*V1, 90)
s1 = switch_terminals(*S1)
v2 = two_terminal(*V2, 0)
d1 = two_terminal(*D1, 270, ("a", "k"))
l1 = two_terminal(*L1, 0)
c1 = two_terminal(*C1, 90)
r1 = two_terminal(*R1, 90)

blocks = [
    block("v1", "physical-electrical.source.voltage_dc", V1, 90, {"V": 12}),
    block("s1", "passive.switch.voltage", S1, 0, {"Ron": 1e-3, "Roff": 1e6}),
    block("v2", "source.voltage.pulse", V2, 0,
          {"V1": 0, "V2": 5, "TD": 0, "TR": 1e-8, "TF": 1e-8, "PW": 6e-6, "PER": 1e-5}),
    block("d1", "physical-electrical.semiconductor.diode", D1, 270),
    block("l1", "passive.inductor", L1, 0, {"L": 1e-4}),
    block("c1", "passive.capacitor", C1, 90, {"C": 1e-4}),
    block("r1", "passive.resistor", R1, 90, {"R": 10}),
]


def wire(wid, a, ap, b, bp, waypoints):
    return {
        "id": wid,
        "from": {"block": a, "port": ap},
        "to": {"block": b, "port": bp},
        "waypoints": [list(w) for w in waypoints],
        "pinned": False,
        "net": None,
        "kind": "physical-electrical",
    }


wires = [
    # input rail: V1 + up to the switch
    wire("w-vin-sw", "v1", "p", "s1", "p", [(v1["p"][0], TOP)]),
    # switch node: on along the rail to the inductor, and down to the diode
    wire("w-sw-l", "s1", "n", "l1", "p", []),
    wire("w-sw-d", "s1", "n", "d1", "k", [(d1["k"][0], TOP)]),
    # output node: inductor into the capacitor, capacitor across to the load
    wire("w-l-c", "l1", "n", "c1", "p", [(c1["p"][0], TOP)]),
    wire("w-c-r", "c1", "p", "r1", "p", []),
    # return rail, chained left to right
    wire("w-v-d", "v1", "n", "d1", "a", [(v1["n"][0], BOTTOM), (d1["a"][0], BOTTOM)]),
    wire("w-d-c", "d1", "a", "c1", "n", [(d1["a"][0], BOTTOM), (c1["n"][0], BOTTOM)]),
    wire("w-c-rb", "c1", "n", "r1", "n", [(c1["n"][0], BOTTOM), (r1["n"][0], BOTTOM)]),
    # gate drive: two straight verticals under the switch
    wire("w-g-p", "v2", "p", "s1", "cp", []),
    wire("w-g-n", "v2", "n", "s1", "cn", []),
]

doc = {
    "schema_version": 2,
    "model": {
        "id": "buck_converter",
        "name": "Buck converter",
        "grid": 20,
        "params": {},
        "blocks": blocks,
        "wires": wires,
        "lines": [],
        "nets": [],
        "simulation": {
            "analyses": [
                {"id": "tran", "type": "TRAN", "tstep": 1e-7, "tstop": 2e-3}
            ],
            "default_analysis": "tran",
        },
        "metadata": {},
    },
}

# --- assertions: every terminal and bend on the grid, no part overlaps ---
for w in wires:
    for wx, wy in w["waypoints"]:
        assert wx % 20 == 0 and wy % 20 == 0, (w["id"], wx, wy)

boxes = {
    "v1": (80, 240, 80, 120), "s1": (260, 120, 120, 120), "v2": (260, 320, 120, 80),
    "d1": (460, 260, 80, 120), "l1": (600, 100, 120, 80), "c1": (800, 260, 80, 120),
    "r1": (980, 260, 80, 120),
}
ids = list(boxes)
for i, a in enumerate(ids):
    for b in ids[i + 1:]:
        ax, ay, aw, ah = boxes[a]
        bx, by, bw, bh = boxes[b]
        overlap = ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah
        assert not overlap, f"{a} overlaps {b}"

PORTS = {
    "v1": {"p", "n"}, "s1": {"p", "n", "cp", "cn"}, "v2": {"p", "n"},
    "d1": {"a", "k"}, "l1": {"p", "n"}, "c1": {"p", "n"}, "r1": {"p", "n"},
}
for w in wires:
    for end in ("from", "to"):
        blk, prt = w[end]["block"], w[end]["port"]
        assert prt in PORTS[blk], f'{w["id"]}: {blk} has no port {prt!r}'

out = pathlib.Path(sys.argv[1])
out.write_text(json.dumps(doc, indent=1) + "\n")
print(f"wrote {out}  ({len(blocks)} blocks, {len(wires)} wires) — grid-exact, no overlaps")
for name, pts in [("v1", v1), ("s1", s1), ("d1", d1), ("l1", l1), ("c1", c1), ("r1", r1)]:
    print(f"  {name}: {pts}")

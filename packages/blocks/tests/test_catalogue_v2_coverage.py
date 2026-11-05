"""BE-40 — catalogue v2 tiered-template coverage tests."""

from __future__ import annotations

import importlib.util
import pathlib
import re
from typing import Any

import numpy as np
import yaml

from simulator.catalogue.load import CatalogueRegistry

# Enumerating the registry is the whole point of the BG-12 guards below, and
# there is no public "list every registered pair" accessor.
from simulator.compiler.spice_card_emitters import _V2_REGISTRY

REPO_ROOT = pathlib.Path(__file__).parents[3]
BLOCKS_ROOT = REPO_ROOT / "packages" / "blocks" / "src" / "blocks"

# Spec source: docs/specs/gsim-sch-format.md §15.2-§15.5
SPEC_15_2_TO_15_5_TYPES = [
    # 15.2 physical-electrical
    "physical-electrical.passive.resistor",
    "physical-electrical.passive.capacitor",
    "physical-electrical.passive.inductor",
    "physical-electrical.passive.mutual_inductor",
    "physical-electrical.passive.transformer",
    "physical-electrical.passive.memristor",
    "physical-electrical.passive.gyrator",
    "physical-electrical.source.voltage_dc",
    "physical-electrical.source.current_dc",
    "physical-electrical.source.voltage_ac",
    "physical-electrical.source.current_ac",
    "physical-electrical.source.voltage_pulse",
    "physical-electrical.source.voltage_pwl",
    "physical-electrical.source.vcvs",
    "physical-electrical.source.vccs",
    "physical-electrical.source.ccvs",
    "physical-electrical.source.cccs",
    "physical-electrical.source.controlled_voltage",
    "physical-electrical.source.controlled_current",
    "physical-electrical.semiconductor.diode",
    "physical-electrical.semiconductor.led",
    "physical-electrical.semiconductor.photodiode",
    "physical-electrical.semiconductor.zener",
    "physical-electrical.semiconductor.bjt_npn",
    "physical-electrical.semiconductor.bjt_pnp",
    "physical-electrical.semiconductor.mosfet_n",
    "physical-electrical.semiconductor.mosfet_p",
    "physical-electrical.semiconductor.igbt_n",
    "physical-electrical.semiconductor.thyristor",
    "physical-electrical.switch.voltage_controlled",
    "physical-electrical.switch.current_controlled",
    "physical-electrical.switch.generic",
    "physical-electrical.opamp.ideal",
    "physical-electrical.opamp.finite_gain",
    "physical-electrical.opamp.band_limited",
    "physical-electrical.opamp.comparator",
    "physical-electrical.sensor.voltage",
    "physical-electrical.sensor.current",
    "physical-electrical.reference.ground",
    "physical-electrical.tline.lossless",
    "physical-electrical.tline.lossy",
    # 15.3 physical-translational
    "physical-translational.element.mass",
    "physical-translational.element.spring",
    "physical-translational.element.damper",
    "physical-translational.element.friction",
    "physical-translational.element.hard_stop",
    "physical-translational.reference.world",
    "physical-translational.source.force",
    "physical-translational.source.velocity",
    "physical-translational.sensor.force",
    "physical-translational.sensor.velocity",
    "physical-translational.sensor.position",
    # 15.4 physical-rotational
    "physical-rotational.element.inertia",
    "physical-rotational.element.spring",
    "physical-rotational.element.damper",
    "physical-rotational.element.friction",
    "physical-rotational.element.hard_stop",
    "physical-rotational.reference.world",
    "physical-rotational.source.torque",
    "physical-rotational.source.angular_velocity",
    "physical-rotational.sensor.torque",
    "physical-rotational.sensor.angular_velocity",
    "physical-rotational.sensor.angle",
    # 15.5 physical-thermal
    "physical-thermal.element.mass",
    "physical-thermal.element.resistance",
    "physical-thermal.element.conduction",
    "physical-thermal.element.convection",
    "physical-thermal.element.radiation",
    "physical-thermal.reference.absolute",
    "physical-thermal.source.heat_flow",
    "physical-thermal.source.temperature",
    "physical-thermal.source.controlled_heat_flow",
    "physical-thermal.source.controlled_temperature",
    "physical-thermal.sensor.heat_flow",
    "physical-thermal.sensor.temperature",
]


def _load_metadata_map() -> dict[str, tuple[pathlib.Path, dict[str, Any]]]:
    mapping: dict[str, tuple[pathlib.Path, dict[str, Any]]] = {}
    for path in BLOCKS_ROOT.rglob("metadata.yaml"):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        block_type = data.get("type")
        if block_type:
            mapping[str(block_type)] = (path, data)
    return mapping


def _declared_tiers(metadata: dict[str, Any]) -> list[str]:
    tiers: list[str] = []
    for fidelity in metadata.get("fidelities", []):
        tier = fidelity.get("tier") if isinstance(fidelity, dict) else None
        if isinstance(tier, str) and tier:
            tiers.append(tier)
    return tiers


def _default_params(metadata: dict[str, Any], tier: str) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for p in metadata.get("params", []):
        if isinstance(p, dict) and "name" in p:
            params[str(p["name"])] = p.get("default")

    for fidelity in metadata.get("fidelities", []):
        if not isinstance(fidelity, dict) or fidelity.get("tier") != tier:
            continue
        for p in fidelity.get("params", []):
            if isinstance(p, dict) and "id" in p:
                params[str(p["id"])] = p.get("default")

    return params


def _load_equations_from_file(path: pathlib.Path):  # type: ignore[no-untyped-def]
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    equations_cls = getattr(module, "Equations", None)
    assert equations_cls is not None, f"No Equations class in {path}"
    return equations_cls()


def _evaluate_vector(  # type: ignore[no-untyped-def]
    equations,
    state: dict[str, float],
    inputs: dict[str, float],
    params: dict[str, Any],
) -> np.ndarray:
    if hasattr(equations, "residuals"):
        out = equations.residuals(state, params)
        return np.asarray(out, dtype=float)

    outputs, dstate = equations.derivatives(0.0, inputs, state, params)
    vals = list(outputs.values()) + list(dstate.values())
    return np.asarray(vals, dtype=float)


def _extract_probe_keys(origin_path: pathlib.Path) -> list[str]:
    source = origin_path.read_text(encoding="utf-8")
    state_keys = re.findall(r"state\.get\(\s*['\"]([^'\"]+)['\"]", source)
    input_keys = re.findall(r"inputs\.get\(\s*['\"]([^'\"]+)['\"]", source)
    keys = sorted(set(state_keys + input_keys))
    return keys or ["__probe__"]


def _assert_c1_continuity(  # type: ignore[no-untyped-def]
    equations,
    origin_path: pathlib.Path,
    params: dict[str, Any],
) -> None:
    probe_keys = _extract_probe_keys(origin_path)
    h = 1.0e-4
    grid = np.linspace(-1.0, 1.0, 21)

    for key in probe_keys:
        for x in grid[1:-1]:
            state_m = {key: float(x - h)}
            state_0 = {key: float(x)}
            state_p = {key: float(x + h)}
            inputs_m = {key: float(x - h)}
            inputs_0 = {key: float(x)}
            inputs_p = {key: float(x + h)}

            y_m = _evaluate_vector(equations, state_m, inputs_m, params)
            y_0 = _evaluate_vector(equations, state_0, inputs_0, params)
            y_p = _evaluate_vector(equations, state_p, inputs_p, params)

            if y_0.size == 0:
                continue

            slope_l = (y_0 - y_m) / h
            slope_r = (y_p - y_0) / h

            assert np.all(np.isfinite(y_0)), f"Non-finite output in {origin_path}"
            assert np.all(np.isfinite(slope_l)), f"Non-finite left slope in {origin_path}"
            assert np.all(np.isfinite(slope_r)), f"Non-finite right slope in {origin_path}"
            assert float(np.max(np.abs(slope_r - slope_l))) < 1e-2, (
                f"C1 continuity violated in {origin_path} for probe key {key!r} at x={x}"
            )


# ---------------------------------------------------------------------------
# Acceptance: test_catalogue_coverage
# ---------------------------------------------------------------------------


def test_catalogue_coverage() -> None:
    metadata_map = _load_metadata_map()
    registry = CatalogueRegistry.discover(blocks_root=BLOCKS_ROOT)

    for block_type in SPEC_15_2_TO_15_5_TYPES:
        assert block_type in metadata_map, (
            f"Missing metadata/type for spec block {block_type!r} (§15.2-§15.5)"
        )

        metadata_path, metadata = metadata_map[block_type]
        declared_tiers = _declared_tiers(metadata)
        assert declared_tiers, f"No fidelities declared in {metadata_path}"

        for tier in declared_tiers:
            tier_files = sorted(metadata_path.parent.glob(f"*_{tier}.py"))
            assert tier_files, (
                f"No template file found for ({block_type!r}, {tier!r}) next to {metadata_path}"
            )

            template_path = tier_files[0]
            equations = _load_equations_from_file(template_path)
            assert equations is not None

            assert registry.contains(block_type, tier), (
                f"Catalogue missing registered template for ({block_type!r}, {tier!r})"
            )

            entry = registry.get_template(block_type, tier)
            assert entry.origin_path == template_path


# ---------------------------------------------------------------------------
# Acceptance: test_resistor_three_tiers
# ---------------------------------------------------------------------------


def test_resistor_three_tiers() -> None:
    registry = CatalogueRegistry.discover(blocks_root=BLOCKS_ROOT)
    block_type = "physical-electrical.passive.resistor"

    assert registry.contains(block_type, "ideal")
    assert registry.contains(block_type, "behavioral")
    assert registry.contains(block_type, "spice")

    ideal = registry.get_template(block_type, "ideal").equations
    behavioral = registry.get_template(block_type, "behavioral").equations
    spice = registry.get_template(block_type, "spice").equations

    # ideal: I = V / R  <=>  residual = v_pn - R * i = 0
    R = 2200.0
    V = 5.5
    i_val = V / R
    ideal_residual = ideal.residuals({"v_pn": V, "i": i_val}, {"R": R})[0]
    assert abs(ideal_residual) < 1e-12

    # behavioral: R(T) = R0 * (1 + alpha * (T - T_ref))
    R0 = 100.0
    alpha = 3.9e-3
    T_ref = 300.15
    T = 340.15
    I_b = 0.2
    R_T = R0 * (1.0 + alpha * (T - T_ref))
    V_b = R_T * I_b
    behavioral_residual = behavioral.residuals(
        {"v_pn": V_b, "i": I_b, "T": T},
        {"R": R0, "alpha": alpha, "T_ref": T_ref},
    )[0]
    assert abs(behavioral_residual) < 1e-12

    # spice: accepts `model` parameter
    spice_residuals = spice.residuals(
        {"v_pn": 1.0, "i": 0.001},
        {"R": 1000.0, "model": "RMOD", "TC1": 1.0e-3, "TC2": 1.0e-6},
    )
    assert isinstance(spice_residuals, list)


# ---------------------------------------------------------------------------
# Acceptance: test_smoothness_invariant
# ---------------------------------------------------------------------------


def test_smoothness_invariant() -> None:
    metadata_map = _load_metadata_map()
    registry = CatalogueRegistry.discover(blocks_root=BLOCKS_ROOT)

    ideal_pairs = sorted(
        (block_type, tier) for (block_type, tier) in registry.all_pairs() if tier == "ideal"
    )
    assert ideal_pairs, "No ideal-tier templates discovered"

    for block_type, tier in ideal_pairs:
        entry = registry.get_template(block_type, tier)
        _, metadata = metadata_map.get(block_type, (None, {}))
        params = _default_params(metadata, tier)
        _assert_c1_continuity(entry.equations, entry.origin_path, params)


# ---------------------------------------------------------------------------
# BG-12: catalogue ↔ v2 SPICE emitter consistency
#
# BG-12 was a silent split: the catalogue carried two directories for the same
# DC voltage source ("…source.voltage_dc" and "…source.voltage.dc") and only
# the first had an entry in spice_card_emitters._V2_REGISTRY. Documents using
# the other spelling died with UnsupportedBlockError, and the only test that
# covered it skipped on hosts without a configured solver — so nothing failed.
#
# The guards below make that class of split fail in CI on every host:
#   1. no two catalogue types are mere spelling variants of one another;
#   2. every registered emitter names a type the catalogue actually has;
#   3. every physical-electrical catalogue (type, tier) either has an emitter
#      or is listed in PE_PAIRS_WITHOUT_V2_EMITTER below.
# ---------------------------------------------------------------------------

_PE_PREFIX = "physical-electrical."

# Catalogue (type, tier) pairs that legitimately have no v2 SPICE emitter yet:
# the block exists in the catalogue for the palette and for the equation-based
# solver paths, but nobody has written its SPICE card renderer. Deleting an
# entry from this list is how you record that an emitter landed; ADDING one is
# a deliberate act that must come with the reason in the commit message.
PE_PAIRS_WITHOUT_V2_EMITTER: frozenset[tuple[str, str]] = frozenset(
    {
        # Passive components with no SPICE primitive card yet.
        ("physical-electrical.passive.gyrator", "ideal"),
        ("physical-electrical.passive.gyrator", "behavioral"),
        ("physical-electrical.passive.gyrator", "spice"),
        ("physical-electrical.passive.memristor", "ideal"),
        ("physical-electrical.passive.memristor", "behavioral"),
        ("physical-electrical.passive.memristor", "spice"),
        # Ground is a net, not a card: it is resolved during net assignment.
        ("physical-electrical.reference.ground", "ideal"),
        # Semiconductors: only the ideal tier of a few devices is emitted; the
        # behavioral/spice tiers need .MODEL card synthesis (not written yet).
        ("physical-electrical.semiconductor.bjt_npn", "behavioral"),
        ("physical-electrical.semiconductor.bjt_npn", "spice"),
        ("physical-electrical.semiconductor.bjt_pnp", "ideal"),
        ("physical-electrical.semiconductor.bjt_pnp", "behavioral"),
        ("physical-electrical.semiconductor.bjt_pnp", "spice"),
        ("physical-electrical.semiconductor.diode", "behavioral"),
        ("physical-electrical.semiconductor.diode", "spice"),
        ("physical-electrical.semiconductor.igbt_n", "ideal"),
        ("physical-electrical.semiconductor.igbt_n", "behavioral"),
        ("physical-electrical.semiconductor.igbt_n", "spice"),
        ("physical-electrical.semiconductor.led", "ideal"),
        ("physical-electrical.semiconductor.led", "behavioral"),
        ("physical-electrical.semiconductor.led", "spice"),
        ("physical-electrical.semiconductor.mosfet_n", "behavioral"),
        ("physical-electrical.semiconductor.mosfet_n", "spice"),
        ("physical-electrical.semiconductor.mosfet_p", "behavioral"),
        ("physical-electrical.semiconductor.mosfet_p", "spice"),
        ("physical-electrical.semiconductor.photodiode", "ideal"),
        ("physical-electrical.semiconductor.photodiode", "behavioral"),
        ("physical-electrical.semiconductor.photodiode", "spice"),
        ("physical-electrical.semiconductor.thyristor", "ideal"),
        ("physical-electrical.semiconductor.thyristor", "behavioral"),
        ("physical-electrical.semiconductor.thyristor", "spice"),
        ("physical-electrical.semiconductor.zener", "ideal"),
        ("physical-electrical.semiconductor.zener", "behavioral"),
        ("physical-electrical.semiconductor.zener", "spice"),
        # Sensors lower to probe cards, not to an element of their own.
        ("physical-electrical.sensor.current", "ideal"),
        ("physical-electrical.sensor.voltage", "ideal"),
        # Dependent / controlled sources: emitters not written yet.
        ("physical-electrical.source.cccs", "ideal"),
        ("physical-electrical.source.ccvs", "ideal"),
        ("physical-electrical.source.controlled_current", "ideal"),
        ("physical-electrical.source.controlled_voltage", "ideal"),
        ("physical-electrical.source.vccs", "ideal"),
        ("physical-electrical.source.vcvs", "ideal"),
        ("physical-electrical.source.voltage_pwl", "ideal"),
        # Switch behavioral tiers need a smoothed .MODEL; only ideal is emitted.
        ("physical-electrical.switch.current_controlled", "behavioral"),
        ("physical-electrical.switch.generic", "behavioral"),
        ("physical-electrical.switch.voltage_controlled", "behavioral"),
        # Transmission lines: T/O element cards not written yet.
        ("physical-electrical.tline.lossless", "ideal"),
        ("physical-electrical.tline.lossy", "ideal"),
    }
)


def _spelling_key(block_type: str) -> str:
    """Collapse a type string to its separator-insensitive identity.

    ``physical-electrical.source.voltage_dc`` and
    ``physical_electrical.source.voltage.dc`` both collapse to
    ``physicalelectricalsourcevoltagedc``, so the two BG-12 spellings of one
    component are recognisable as duplicates of each other.
    """
    return re.sub(r"[-_.]", "", block_type.lower())


def test_no_type_declared_by_two_directories() -> None:
    """Exactly one metadata.yaml may declare any given type.

    ``_load_metadata_map`` is last-write-wins over ``rglob`` order, so two
    directories claiming one type make every type-keyed test depend on
    filesystem iteration order — which is how three legacy ``passive/*``
    entries silently shadowed the real ``physical-electrical/passive/*``
    catalogue entries (and their behavioral/spice tiers).
    """
    by_type: dict[str, list[str]] = {}
    for path in sorted(BLOCKS_ROOT.rglob("metadata.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        block_type = data.get("type")
        if block_type:
            by_type.setdefault(str(block_type), []).append(str(path.relative_to(BLOCKS_ROOT)))

    duplicates = {t: paths for t, paths in by_type.items() if len(paths) > 1}
    assert not duplicates, (
        "These types are declared by more than one metadata.yaml. Keep the "
        "directory that carries the tier templates and drop the stray 'type:' "
        f"from the other: {duplicates}"
    )


def test_no_duplicate_type_spellings() -> None:
    """No two catalogue types may be separator-variants of the same name.

    This is the guard BG-12 needed: ``…source.voltage.dc`` and
    ``…source.voltage_dc`` were two directories for one component, and only
    one of them had an emitter.
    """
    metadata_map = _load_metadata_map()

    by_key: dict[str, list[str]] = {}
    for block_type in metadata_map:
        by_key.setdefault(_spelling_key(block_type), []).append(block_type)

    collisions = {key: sorted(types) for key, types in by_key.items() if len(types) > 1}
    assert not collisions, (
        "Catalogue types that differ only in '-' / '_' / '.' separators — pick one "
        "canonical spelling per docs/specs/gsim-sch-format.md §6.1/§15 and delete "
        f"the duplicate directory: {collisions}"
    )


def test_v2_registry_types_exist_in_catalogue() -> None:
    """Every registered v2 emitter must name a type the catalogue actually has.

    A registry entry for a type no catalogue directory declares is dead code
    that also hides the absence of an emitter for the real spelling.
    """
    catalogue_types = set(_load_metadata_map())

    orphans = sorted(
        {block_type for (block_type, _tier) in _V2_REGISTRY if block_type not in catalogue_types}
    )
    assert not orphans, (
        "spice_card_emitters._V2_REGISTRY registers types with no catalogue "
        f"metadata.yaml (stale spelling, or the block was removed): {orphans}"
    )


def test_every_physical_electrical_type_has_a_v2_emitter() -> None:
    """Every physical-electrical (type, tier) has an emitter or is allowlisted.

    ``_get_v2_render_info`` raises ``UnsupportedBlockError`` for any
    ``physical-electrical.*`` block with no ``_V2_REGISTRY`` entry, so an
    un-emitted catalogue type is a document the compiler cannot compile.
    """
    metadata_map = _load_metadata_map()

    uncovered: list[tuple[str, str]] = []
    for block_type, (_path, metadata) in metadata_map.items():
        if not block_type.startswith(_PE_PREFIX):
            continue
        for tier in _declared_tiers(metadata):
            pair = (block_type, tier)
            if pair not in _V2_REGISTRY and pair not in PE_PAIRS_WITHOUT_V2_EMITTER:
                uncovered.append(pair)

    assert not uncovered, (
        "physical-electrical catalogue entries with no v2 SPICE emitter and no "
        "entry in PE_PAIRS_WITHOUT_V2_EMITTER. Either register an emitter in "
        "simulator/compiler/spice_card_emitters.py or add the pair to the "
        f"allowlist with a reason: {sorted(uncovered)}"
    )


def test_v2_emitter_allowlist_has_no_stale_entries() -> None:
    """The allowlist must not name pairs that are emitted, or types that are gone.

    Without this the allowlist rots into a blanket exemption and stops being a
    readable TODO list.
    """
    metadata_map = _load_metadata_map()
    declared: set[tuple[str, str]] = {
        (block_type, tier)
        for block_type, (_path, metadata) in metadata_map.items()
        for tier in _declared_tiers(metadata)
    }

    now_emitted = sorted(p for p in PE_PAIRS_WITHOUT_V2_EMITTER if p in _V2_REGISTRY)
    assert not now_emitted, (
        "These pairs now have a v2 emitter — remove them from "
        f"PE_PAIRS_WITHOUT_V2_EMITTER: {now_emitted}"
    )

    not_in_catalogue = sorted(p for p in PE_PAIRS_WITHOUT_V2_EMITTER if p not in declared)
    assert not not_in_catalogue, (
        "These allowlisted pairs are no longer declared by any metadata.yaml — "
        f"remove them from PE_PAIRS_WITHOUT_V2_EMITTER: {not_in_catalogue}"
    )

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { useToastStore } from "../store/toast";
import { useWaveformStore } from "../store/waveform";
import { AxesLegend } from "./AxesLegend";
import { ExportDialog, type ExportSubject } from "./ExportDialog";
import { MeasurementsBar } from "./MeasurementsBar";
import {
  MAX_RENDER_POINTS,
  buildAlignedData,
  buildAxes,
  buildScales,
  buildSeries,
  buildSpines,
  dataExtents,
  isBodeAxes,
  makePanAwareMousedown,
  overlayPx,
  spinesChanged,
  xAxisDomain,
} from "./axes-config";
import type { SpineSpec } from "./axes-config";
import { buildBodeAnnotations } from "./bode-annotations";
import type { AnnotationSpec, BodeMargins, MarginBadgeSpec } from "./bode-annotations";
import { axesExportSubject } from "./export-subjects";
import { withHistory } from "./history";
import { readChartTheme } from "./theme";
import type { SignalRef, WaveformSignal } from "./types";

export type { BodeMargins };

// Stable colour palette reused from the store — must stay in sync visually.
const _GROUP_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
];

function _groupColor(index: number): string {
  return _GROUP_COLORS[index % _GROUP_COLORS.length] ?? "#3b82f6";
}

/**
 * Floors for the measured size. A chart narrower or shorter than this has no
 * room left for its own axes after uPlot subtracts them, and uPlot throws
 * rather than drawing a negative-width plot area.
 */
const MIN_CHART_WIDTH = 240;
const MIN_CHART_HEIGHT = 120;

/**
 * How long the view has to hold still before the data is re-decimated for it.
 *
 * Re-decimating on every frame of a wheel zoom would cost O(window) per
 * frame across every trace, which on a long run is tens of milliseconds and
 * the end of 60 fps. Rescaling the data already in hand is free and looks
 * right immediately; the sharper version lands once the gesture stops. Same
 * bargain a map makes with its tiles.
 */
const REFINE_DELAY_MS = 140;

/**
 * Points per view, derived from the plot's width.
 *
 * Two per pixel is the most a min/max decimation can show: one for the top
 * of each column, one for the bottom. Beyond that the extra samples land on
 * pixels that are already painted.
 */
function budgetFor(plotWidth: number): number {
  return Math.min(MAX_RENDER_POINTS, Math.max(1000, Math.round(plotWidth * 2)));
}

// Stable fallback so `refs` doesn't become a fresh [] reference on every
// render while axesEntry is undefined (see the useMemo below).
const _EMPTY_REFS: SignalRef[] = [];

export interface AxesProps {
  axesId: string;
  /** Fixed chart width. Omit (the normal case) to fill the grid cell. */
  width?: number;
  /** Fixed chart height. Omit (the normal case) to fill the grid cell. */
  height?: number;
  onZoomChange?: (xMin: number, xMax: number, yMin: number, yMax: number) => void;
  /** Optional Bode stability margins; triggers annotation overlays when present. */
  bodeMargins?: BodeMargins;
}

/**
 * Live charts by axes id, for the render and stress harnesses. Kept out of
 * React state deliberately: nothing in the app reads it, so it must not be
 * able to cause a render.
 */
const _charts = new Map<string, uPlot>();

function _registerChart(axesId: string, chart: uPlot | null): void {
  if (chart) _charts.set(axesId, chart);
  else _charts.delete(axesId);
  (globalThis as { __gensim_charts?: Map<string, uPlot> }).__gensim_charts = _charts;
}

export function Axes({ axesId, width, height, onZoomChange, bodeMargins }: AxesProps) {
  const axesEntry = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);
  const couplingGroups = useWaveformStore((s) => s.couplingGroups);
  const assignAxesToGroup = useWaveformStore((s) => s.assignAxesToGroup);
  const propagateZoom = useWaveformStore((s) => s.propagateZoom);
  const setAxesZoom = useWaveformStore((s) => s.setAxesZoom);
  const addSignalToAxes = useWaveformStore((s) => s.addSignalToAxes);
  // FE-167: maximize/restore this axes to fill its figure.
  const maximizedAxesId = useWaveformStore((s) =>
    axesEntry ? s.figures.get(axesEntry.figureId)?.maximizedAxesId : undefined,
  );
  const setMaximizedAxes = useWaveformStore((s) => s.setMaximizedAxes);
  const setActiveAxes = useWaveformStore((s) => s.setActiveAxes);
  const setAxesHistoryDepth = useWaveformStore((s) => s.setAxesHistoryDepth);
  const isTarget = useWaveformStore((s) => s.activeAxesId === axesId);
  const pushToast = useToastStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  // The plot's real size on screen. uPlot needs explicit pixel dimensions —
  // it cannot be told to fill its parent — so something has to measure the
  // parent and tell it. Nothing did: every chart was built at the component's
  // default 800x300 regardless of the panel it sat in, which on a maximised
  // VS Code panel left roughly two thirds of the surface empty grey, and on a
  // narrow one clipped the plot.
  const [measured, setMeasured] = useState<{ width: number; height: number }>({
    width: width ?? MIN_CHART_WIDTH,
    height: height ?? MIN_CHART_HEIGHT,
  });
  const plotWidth = width ?? measured.width;
  const plotHeight = height ?? measured.height;
  // Read by the construction path below, which must not list the size in its
  // deps: a resize is handled by uPlot's own setSize (see the effect further
  // down), not by destroying and rebuilding the chart on every pixel of a
  // splitter drag.
  const sizeRef = useRef({ width: plotWidth, height: plotHeight });
  sizeRef.current = { width: plotWidth, height: plotHeight };
  const spinesRef = useRef<SpineSpec[]>([]);
  const dragOverRef = useRef(false);
  // Last zoom bounds this component pushed into uPlot — lets the sync effect
  // below tell "store changed because we applied it" apart from "store
  // changed because the user needs a fresh setScale call", so it doesn't
  // loop forever bouncing values between uPlot's setScale hook and the store.
  const appliedZoomRef = useRef<{
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
  }>({});
  // Wheel/dblclick handlers are bound once per uPlot instance (in the `ready`
  // hook) but need the *current* refs/signalCache to compute data extents —
  // this ref keeps them fresh across renders that don't trigger a reinit.
  const latestRef = useRef<{ refs: SignalRef[]; signalCache: Map<string, WaveformSignal> }>({
    refs: [],
    signalCache: new Map(),
  });
  // Same idea as latestRef: the reinit branch below reads the *current*
  // zoom bounds without wanting to re-run (and destroy/recreate the uPlot
  // instance) on every zoom change — that's the second effect's job.
  const axesEntryRef = useRef(axesEntry);
  axesEntryRef.current = axesEntry;

  const [annotationLines, setAnnotationLines] = useState<AnnotationSpec[]>([]);
  const [marginBadge, setMarginBadge] = useState<MarginBadgeSpec | null>(null);
  const [exportSubject, setExportSubject] = useState<ExportSubject | null>(null);
  // FE-165: pixel positions for the visible cursor lines (A/B vertical,
  // AH/BH horizontal). Recomputed whenever the chart's scale changes (the
  // `setScale` hook below) and whenever the cursor values themselves change
  // (the dedicated effect further down) — px position depends on both.
  const [cursorLines, setCursorLines] = useState<AnnotationSpec[]>([]);
  // The window the chart is currently showing, and the timer that will
  // re-decimate for it once the view stops moving.
  const viewRef = useRef<[number, number] | null>(null);
  const refineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoized so effects keyed on `refs`/`spines` only re-fire when the
  // underlying signal list or cache actually changes, not on every render
  // for an unrelated reason. Before this fix, buildSpines() (and the O(n)
  // decimation buildAlignedData() triggers downstream, per FE-159) ran
  // fresh on *every* render of every mounted axes — wasteful on its own,
  // and the direct enabler of the FE-165 infinite-loop bug fixed in
  // 29424d2 (that effect depended on this exact unstable `spines`
  // reference). Memoizing here fixes the root cause instead of the one
  // symptom that got caught.
  const ownRefs = axesEntry?.signals ?? _EMPTY_REFS;
  const historyDepth = axesEntry?.historyDepth ?? 0;
  const runHistory = useWaveformStore((s) => s.runHistory);
  /**
   * What this chart draws: the axes' own signals, then the same signals
   * from up to `historyDepth` previous runs. The overlay is derived here
   * rather than stored, so changing the depth cannot disturb the set of
   * signals the user chose.
   */
  const refs = useMemo(
    () => withHistory(ownRefs, signalCache, runHistory, historyDepth),
    [ownRefs, signalCache, runHistory, historyDepth],
  );
  const signalCount = refs.length;
  const spines = useMemo(() => buildSpines(refs, signalCache), [refs, signalCache]);
  const needsReinit = spinesChanged(spinesRef.current, spines);
  const bodeMode = isBodeAxes(refs, signalCache);
  const xDomain = xAxisDomain(refs, signalCache);

  latestRef.current = { refs, signalCache };

  // Find the magnitude spine key for the 0 dB horizontal annotation line.
  const magSpineKey = spines.find((s) => s.quantity === "dB")?.scaleKey ?? "scale-dB";

  // Resolve coupling group info for the badge.
  const couplingGroupId = axesEntry?.couplingGroupId;
  const couplingGroup = couplingGroupId ? couplingGroups.get(couplingGroupId) : undefined;

  // Compute the group's stable colour by iterating the map in insertion order.
  let groupColor = "#3b82f6";
  if (couplingGroup) {
    let idx = 0;
    for (const [gid] of couplingGroups) {
      if (gid === couplingGroupId) {
        groupColor = _groupColor(idx);
        break;
      }
      idx++;
    }
  }

  /**
   * Re-decimate for whatever window is on screen now.
   *
   * `setData(…, false)` keeps the viewer's current zoom instead of
   * autoscaling back out — the window is the reason this ran.
   */
  const refineForView = useCallback(() => {
    const u = uplotRef.current;
    if (!u) return;
    const { refs: liveRefs, signalCache: liveCache } = latestRef.current;
    u.setData(
      buildAlignedData(
        liveRefs,
        liveCache,
        viewRef.current ?? undefined,
        budgetFor(sizeRef.current.width),
      ),
      false,
    );
  }, []);

  const scheduleRefine = useCallback(() => {
    if (refineTimerRef.current) clearTimeout(refineTimerRef.current);
    refineTimerRef.current = setTimeout(() => {
      refineTimerRef.current = null;
      refineForView();
    }, REFINE_DELAY_MS);
  }, [refineForView]);

  useEffect(
    () => () => {
      if (refineTimerRef.current) clearTimeout(refineTimerRef.current);
    },
    [],
  );

  // Keep `measured` in step with the cell the chart sits in. ResizeObserver
  // rather than a window resize listener: the panel is resized by dragging
  // VS Code's own splitters and by maximising an axes, neither of which
  // changes the window size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const next = {
        width: Math.max(MIN_CHART_WIDTH, Math.round(box.width)),
        height: Math.max(MIN_CHART_HEIGHT, Math.round(box.height)),
      };
      setMeasured((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Resize in place. Rebuilding the chart would also work, but it throws away
  // the zoom, the cursors and the decimation cache on every frame of a
  // splitter drag.
  //
  // The overlays have to be recomputed here too. They are positioned in
  // pixels, and uPlot's setSize does not fire `setScale` — so without this,
  // a chart that mounted at its minimum size and then grew to fill the panel
  // kept drawing its cursors at the positions they had when it was 240px
  // wide, bunched against the left edge.
  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;
    u.setSize({ width: plotWidth, height: plotHeight });
    // A wider plot can show more points, so the budget changed with it.
    scheduleRefine();
    const firstYKey = spinesRef.current[0]?.scaleKey ?? "y";
    setCursorLines(_buildCursorLines(axesEntryRef.current, u, firstYKey));
    if (bodeMargins && isBodeAxes(latestRef.current.refs, latestRef.current.signalCache)) {
      const result = buildBodeAnnotations(bodeMargins, u, magSpineKey);
      setAnnotationLines(result.lines);
      setMarginBadge(result.badge);
    }
  }, [plotWidth, plotHeight, bodeMargins, magSpineKey, scheduleRefine]);

  useEffect(() => {
    if (!containerRef.current) return;

    const data = buildAlignedData(
      refs,
      signalCache,
      viewRef.current ?? undefined,
      budgetFor(sizeRef.current.width),
    );
    const hasData = data[0] instanceof Float64Array && data[0].length > 0;

    if (!hasData) {
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
        spinesRef.current = [];
      }
      // Guard against re-setting already-empty state. `spines`/`refs` are
      // now memoized (see the useMemo above this effect), so this no longer
      // fires every render — but keep the guard anyway: calling
      // setAnnotationLines([])/setMarginBadge(null) unconditionally here
      // would still create a new empty-array reference on every *legitimate*
      // re-run (e.g. each streamed chunk while still loading), which never
      // bails out via Object.is, and previously caused a genuine
      // render -> effect -> setState -> render infinite loop ("Maximum
      // update depth exceeded") before `spines`/`refs` were memoized.
      if (annotationLines.length > 0) setAnnotationLines([]);
      if (marginBadge !== null) setMarginBadge(null);
      return;
    }

    if (uplotRef.current && !needsReinit) {
      // Same spine set — just update data without destroying the instance.
      // `false` keeps the viewer's current zoom/pan instead of uPlot's
      // default of autoscaling back out on every streamed chunk.
      uplotRef.current.setData(data, false);
      if (bodeMargins && bodeMode) {
        const result = buildBodeAnnotations(bodeMargins, uplotRef.current, magSpineKey);
        setAnnotationLines(result.lines);
        setMarginBadge(result.badge);
      }
      return;
    }

    // Spine set changed (or first render) — full reinit.
    if (uplotRef.current) {
      uplotRef.current.destroy();
      uplotRef.current = null;
    }

    const series = buildSeries(refs, signalCache, spines);
    const scales = buildScales(spines, xDomain === "frequency");
    const axes = buildAxes(spines, xDomain, readChartTheme(containerRef.current ?? undefined));

    const opts: uPlot.Options = {
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      scales,
      axes,
      series,
      // FE-162: AxesLegend (rendered below) replaces uPlot's bare built-in
      // legend with color-editable, removable rows.
      legend: { show: false },
      // FE-163: when panMode is on, dragging translates the visible window
      // instead of uPlot's default box-zoom.
      cursor: {
        bind: {
          mousedown: makePanAwareMousedown(
            () => axesEntryRef.current?.panMode,
            () => spinesRef.current[0]?.scaleKey ?? "y",
          ),
        },
      },
      hooks: {
        setScale: [
          (u) => {
            const xMin = u.scales.x?.min ?? 0;
            const xMax = u.scales.x?.max ?? 0;
            const firstYKey = spines[0]?.scaleKey ?? "y";
            const yMin = u.scales[firstYKey]?.min ?? 0;
            const yMax = u.scales[firstYKey]?.max ?? 0;
            // Propagate through coupling group (also calls onZoomChange via store subscriber).
            propagateZoom(axesId, xMin, xMax, yMin, yMax);
            if (onZoomChange) {
              onZoomChange(xMin, xMax, yMin, yMax);
            }
            // Re-compute annotation pixel positions after zoom.
            if (bodeMargins && bodeMode) {
              const result = buildBodeAnnotations(bodeMargins, u, magSpineKey);
              setAnnotationLines(result.lines);
              setMarginBadge(result.badge);
            }
            // FE-165: cursor line pixel positions depend on the current
            // scale, so they need recomputing on every zoom/pan too.
            setCursorLines(_buildCursorLines(axesEntryRef.current, u, firstYKey));

            // And re-decimate for the new window, once it stops moving.
            viewRef.current = [xMin, xMax];
            scheduleRefine();
          },
        ],
        ready: [
          (u) => {
            if (bodeMargins && bodeMode) {
              const result = buildBodeAnnotations(bodeMargins, u, magSpineKey);
              setAnnotationLines(result.lines);
              setMarginBadge(result.badge);
            }
            setCursorLines(_buildCursorLines(axesEntryRef.current, u, spines[0]?.scaleKey ?? "y"));

            // Double-click resets the x-range to the full data extent —
            // matches the toolbar's "Fit" button (mirrors common
            // oscilloscope-tool convention).
            u.over.addEventListener("dblclick", () => {
              const ext = dataExtents(latestRef.current.refs, latestRef.current.signalCache);
              if (ext) setAxesZoom(axesId, ext[0], ext[1]);
            });

            // Wheel zooms in/out on the x-range, centred on the cursor's
            // time position, clamped to the data extent.
            u.over.addEventListener(
              "wheel",
              (e: WheelEvent) => {
                e.preventDefault();
                const rect = u.over.getBoundingClientRect();
                const cursorVal = u.posToVal(e.clientX - rect.left, "x");
                const curMin = u.scales.x?.min ?? 0;
                const curMax = u.scales.x?.max ?? 1;
                const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
                let newMin = cursorVal - (cursorVal - curMin) * factor;
                let newMax = cursorVal + (curMax - cursorVal) * factor;
                const ext = dataExtents(latestRef.current.refs, latestRef.current.signalCache);
                if (ext) {
                  newMin = Math.max(newMin, ext[0]);
                  newMax = Math.min(newMax, ext[1]);
                }
                if (newMax > newMin) setAxesZoom(axesId, newMin, newMax);
              },
              { passive: false },
            );
          },
        ],
      },
    };

    uplotRef.current = new uPlot(opts, data, containerRef.current);
    spinesRef.current = spines;
    // Harness door, same role as `__gensim_canvasFitView` on the schematic
    // side: scripts/stress-waveform.mjs reads how many points are actually
    // on screen, which is the one thing a screenshot cannot tell you.
    _registerChart(axesId, uplotRef.current);

    // Reapply any zoom already recorded for this axes (e.g. surviving a
    // spine-set change that forced the reinit above) instead of dropping
    // back to a full autoscale.
    const currentEntry = axesEntryRef.current;
    if (currentEntry?.xMin !== undefined && currentEntry?.xMax !== undefined) {
      uplotRef.current.setScale("x", { min: currentEntry.xMin, max: currentEntry.xMax });
    }
    const firstYKey = spines[0]?.scaleKey ?? "y";
    if (currentEntry?.yMin !== undefined && currentEntry?.yMax !== undefined) {
      uplotRef.current.setScale(firstYKey, { min: currentEntry.yMin, max: currentEntry.yMax });
    }
    appliedZoomRef.current = {
      xMin: currentEntry?.xMin,
      xMax: currentEntry?.xMax,
      yMin: currentEntry?.yMin,
      yMax: currentEntry?.yMax,
    };

    return () => {
      if (uplotRef.current) {
        uplotRef.current.destroy();
        uplotRef.current = null;
        spinesRef.current = [];
      }
      _registerChart(axesId, null);
    };
  }, [
    refs,
    signalCache,
    spines,
    needsReinit,
    onZoomChange,
    axesId,
    propagateZoom,
    setAxesZoom,
    bodeMode,
    xDomain,
    bodeMargins,
    magSpineKey,
    annotationLines,
    marginBadge,
  ]);

  // Apply zoom state set by the toolbar (Zoom In/Out/Fit), double-click
  // reset, or wheel-zoom to the live uPlot instance. This is what makes
  // those controls actually move the chart — they only ever write to the
  // store; this effect is the other half that reads it back out. Guarded by
  // appliedZoomRef so a change *we* just pushed (which round-trips back
  // through uPlot's own setScale hook into the store) doesn't bounce forever.
  useEffect(() => {
    const u = uplotRef.current;
    if (!u || !axesEntry) return;

    const { xMin, xMax, yMin, yMax } = axesEntry;
    const applied = appliedZoomRef.current;
    if (
      xMin === applied.xMin &&
      xMax === applied.xMax &&
      yMin === applied.yMin &&
      yMax === applied.yMax
    ) {
      return;
    }
    appliedZoomRef.current = { xMin, xMax, yMin, yMax };

    if (xMin !== undefined && xMax !== undefined) {
      u.setScale("x", { min: xMin, max: xMax });
    }
    if (yMin !== undefined && yMax !== undefined) {
      const firstYKey = spines[0]?.scaleKey ?? "y";
      u.setScale(firstYKey, { min: yMin, max: yMax });
    }
  }, [axesEntry, spines]);

  // FE-165: recompute cursor line pixel positions whenever the cursor
  // values themselves change (placing/moving a cursor doesn't change the
  // scale, so the setScale hook above never fires for it).
  //
  // BUG FOUND VIA LIVE BROWSER TESTING (post-merge): this effect used to
  // depend on `spines`, a fresh array literal computed on every render (see
  // the "Guard against re-setting already-empty state" comment on the main
  // effect above, which explains why `spines`/`refs` are never stable). That
  // made this effect re-run on *every* render regardless of whether cursors
  // changed, and `_buildCursorLines` always returns a brand-new array
  // (including a new `[]` when no cursors are set) — so `setCursorLines`
  // never bailed via Object.is, causing a genuine
  // render -> effect -> setState -> render infinite loop. Reproduced live:
  // clicking Run pegged a renderer process at 100% CPU with climbing memory
  // within seconds, on a run with zero cursors placed. Fixed by reading the
  // stable `spinesRef.current` (only reassigned on an actual spine-set
  // change, in the main effect) instead of the unstable `spines` prop, and
  // dropping `spines` from the dependency array entirely.
  useEffect(() => {
    const u = uplotRef.current;
    if (!u) return;
    setCursorLines(_buildCursorLines(axesEntry, u, spinesRef.current[0]?.scaleKey ?? "y"));
  }, [axesEntry?.cursorA, axesEntry?.cursorB, axesEntry?.cursorAH, axesEntry?.cursorBH, axesEntry]);

  if (!axesEntry) return null;

  // Drag-to-link handlers on the axes header.
  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData("text/plain", axesId);
    e.dataTransfer.effectAllowed = "link";
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    // Browsers only expose dataTransfer.types (not getData()'s actual
    // payload) before the drop event — so acceptance here can only check
    // "is this a signal/axes-link drag at all," not inspect the payload's
    // contents (e.g. for a live Bode-mode reject cursor). That check
    // happens in handleDrop instead, where the full payload is readable.
    const types = e.dataTransfer.types;
    if (types.includes("application/x-signal") || types.includes("text/plain")) {
      e.preventDefault();
      dragOverRef.current = true;
    }
  }

  function handleDragLeave() {
    dragOverRef.current = false;
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    // FE-160: a signal dropped from SignalRow/SignalBrowser — distinct MIME
    // key from the axes-link drag below, so the two payloads can never be
    // confused (dropping a signal used to be misread as an axes-link drag,
    // which silently created a spurious coupling group instead of adding
    // the signal).
    const signalRaw = e.dataTransfer.getData("application/x-signal");
    if (signalRaw) {
      e.preventDefault();
      dragOverRef.current = false;
      try {
        const payload = JSON.parse(signalRaw) as { simId?: string; signalName?: string };
        if (!payload.simId || !payload.signalName) return;

        // Reject a time-domain signal onto a Bode axes, using the real
        // analysis from signalCache when the signal has already been
        // fetched elsewhere (authoritative). A signal never seen before
        // can't be judged yet — dataTransfer only exposes the actual
        // payload at drop time, not during dragover, so there's no way to
        // show a live reject cursor while hovering; it's allowed through
        // here rather than silently doing nothing.
        if (bodeMode) {
          const cached = useWaveformStore
            .getState()
            .signalCache.get(`${payload.simId}::${payload.signalName}`);
          const isAc = cached?.analysis === "ac_mag" || cached?.analysis === "ac_phase";
          if (cached && !isAc) {
            e.stopPropagation();
            pushToast("Cannot add a time-domain signal to a Bode axes.");
            return;
          }
        }

        addSignalToAxes(axesId, payload.simId, payload.signalName);
      } catch {
        // Malformed payload — no-op drop.
      }
      return;
    }

    e.preventDefault();
    dragOverRef.current = false;
    const sourceAxesId = e.dataTransfer.getData("text/plain");
    if (!sourceAxesId || sourceAxesId === axesId) return;

    // Determine the target group: prefer the drop-target's group, else the
    // source's group, else create a new one below the call site.
    const thisEntry = useWaveformStore.getState().axes.get(axesId);
    const targetGroupId = thisEntry?.couplingGroupId;
    const sourceEntry = useWaveformStore.getState().axes.get(sourceAxesId);
    const sourceGroupId = sourceEntry?.couplingGroupId;

    if (targetGroupId) {
      // Add the dragged axes to this axes' group.
      assignAxesToGroup(sourceAxesId, targetGroupId);
    } else if (sourceGroupId) {
      // Add this axes into the dragged axes' group.
      assignAxesToGroup(axesId, sourceGroupId);
    } else {
      // Neither axes is in a group — create a new one and add both.
      const newGroupId = useWaveformStore.getState().createCouplingGroup("Group", true, false);
      assignAxesToGroup(axesId, newGroupId);
      assignAxesToGroup(sourceAxesId, newGroupId);
    }
  }

  // ---------------------------------------------------------------------------
  // Right-click on axes header → "Export axes…"
  // ---------------------------------------------------------------------------
  function handleHeaderContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!containerRef.current) return;
    setExportSubject(axesExportSubject(axesId, containerRef.current, () => latestRef.current));
  }

  // ---------------------------------------------------------------------------
  // FE-167: maximize/restore toggle.
  // ---------------------------------------------------------------------------
  const isMaximized = maximizedAxesId === axesId;
  function handleMaximizeToggle() {
    if (!axesEntry) return;
    setMaximizedAxes(axesEntry.figureId, isMaximized ? null : axesId);
  }

  return (
    <>
      <div
        className={`axes-container${isTarget ? " axes-container--target" : ""}`}
        data-axes-id={axesId}
        // Clicking an axes points the signal browser's checkboxes at it, so
        // "tick a signal to plot it here" needs no extra step.
        onPointerDownCapture={() => setActiveAxes(axesId)}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Axes header: draggable, shows coupling-group badge; right-click to export */}
        <div
          className="axes-header"
          draggable
          onContextMenu={handleHeaderContextMenu}
          onDragStart={handleDragStart}
        >
          {/* The axes' own title is the signals it carries, which the legend
              below already spells out — so the header shows the thing the
              legend cannot: which coupling group this axes zooms with. It
              used to show eight characters of the axes' UUID, which named
              nothing the user had ever seen or chosen. */}
          <span className="axes-header__grip" aria-hidden="true" />
          {couplingGroup && (
            <span
              className="axes-header__group-badge"
              aria-label={`Coupling group: ${couplingGroup.name}`}
            >
              <span className="axes-header__group-dot" style={{ background: groupColor }} />
              {couplingGroup.name}
            </span>
          )}
          {/* Only offered once there is a past run to show. A control that
              can only ever say "0" is a question with one answer. */}
          {runHistory.length > 0 && (
            <label className="axes-header__history">
              <span>Past runs</span>
              <select
                aria-label="Past runs to overlay"
                value={historyDepth}
                onChange={(event) =>
                  setAxesHistoryDepth(axesId, Number.parseInt(event.target.value, 10))
                }
              >
                {Array.from({ length: runHistory.length + 1 }, (_, depth) => (
                  <option key={depth} value={depth}>
                    {depth}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="axes-header__maximize"
            aria-label={isMaximized ? "Restore axes" : "Maximize axes"}
            title={isMaximized ? "Restore axes" : "Maximize axes to fill figure"}
            onClick={handleMaximizeToggle}
          >
            {isMaximized ? "⤡" : "⤢"}
          </button>
        </div>

        {signalCount > 10 && (
          <div className="axes-signal-warning" role="alert">
            {signalCount} signals on one axes — consider splitting across multiple axes.
          </div>
        )}
        <AxesLegend axesId={axesId} />
        <MeasurementsBar axesId={axesId} />
        <div ref={containerRef} className="axes-plot">
          {/* Bode annotation lines rendered as absolutely-positioned overlays. */}
          {annotationLines.map((line) =>
            line.kind === "vline" ? (
              <div
                key={`vline-${line.value}`}
                className="axes-overlay-line axes-overlay-line--v axes-overlay-line--bode"
                aria-label={line.label}
                style={{ left: line.px }}
              />
            ) : (
              <div
                key={`hline-${line.value}`}
                className="axes-overlay-line axes-overlay-line--h axes-overlay-line--bode"
                aria-label={line.label}
                style={{ top: line.px }}
              />
            ),
          )}
          {/* FE-165: cursor lines (A/B vertical, AH/BH horizontal) rendered as absolutely-positioned overlays. */}
          {cursorLines.map((line) =>
            line.kind === "vline" ? (
              <div
                key={`cursor-vline-${line.label}`}
                className="axes-overlay-line axes-overlay-line--v axes-cursor axes-cursor--x"
                aria-label={`Cursor ${line.label}`}
                style={{ left: line.px }}
              >
                <span className="axes-cursor__tag">{line.label}</span>
              </div>
            ) : (
              <div
                key={`cursor-hline-${line.label}`}
                className="axes-overlay-line axes-overlay-line--h axes-cursor axes-cursor--y"
                aria-label={`Cursor ${line.label}`}
                style={{ top: line.px }}
              >
                <span className="axes-cursor__tag">{line.label}</span>
              </div>
            ),
          )}
          {/* Bode margin badge */}
          {marginBadge && (
            <div
              className="bode-margin-badge"
              style={{ left: marginBadge.pxLeft, top: marginBadge.pxTop }}
            >
              <div>GM: {marginBadge.gainMarginDb.toFixed(1)} dB</div>
              <div>PM: {marginBadge.phaseMarginDeg.toFixed(1)}°</div>
              <div>BW: {_formatHz(marginBadge.bandwidth3dbHz)}</div>
            </div>
          )}
        </div>
      </div>

      {exportSubject && (
        <ExportDialog subject={exportSubject} onClose={() => setExportSubject(null)} />
      )}
    </>
  );
}

/**
 * FE-165: build the (up to) 4 cursor overlay lines for the current uPlot scale.
 *

 * `false`, not `true`: uPlot's third argument asks for *canvas* pixels, which
 * are CSS pixels multiplied by the device pixel ratio. These positions are
 * written straight into `style.left` / `style.top` on overlay divs, which are
 * laid out in CSS pixels — so on any HiDPI display (every retina laptop, and
 * VS Code at a zoom level above 100%) every cursor and annotation line was
 * drawn at twice its distance from the origin, landing outside the plot.
 * At dpr 1 the two agree, which is why this survived.
 */

function _buildCursorLines(
  entry: { cursorA?: number; cursorB?: number; cursorAH?: number; cursorBH?: number } | undefined,
  u: uPlot,
  yScaleKey: string,
): AnnotationSpec[] {
  if (!entry) return [];
  const lines: AnnotationSpec[] = [];
  if (entry.cursorA !== undefined) {
    lines.push({
      kind: "vline",
      px: overlayPx(u, entry.cursorA, "x", "x"),
      scaleKey: "x",
      value: entry.cursorA,
      label: "A",
    });
  }
  if (entry.cursorB !== undefined) {
    lines.push({
      kind: "vline",
      px: overlayPx(u, entry.cursorB, "x", "x"),
      scaleKey: "x",
      value: entry.cursorB,
      label: "B",
    });
  }
  if (entry.cursorAH !== undefined) {
    lines.push({
      kind: "hline",
      px: overlayPx(u, entry.cursorAH, yScaleKey, "y"),
      scaleKey: yScaleKey,
      value: entry.cursorAH,
      label: "A",
    });
  }
  if (entry.cursorBH !== undefined) {
    lines.push({
      kind: "hline",
      px: overlayPx(u, entry.cursorBH, yScaleKey, "y"),
      scaleKey: yScaleKey,
      value: entry.cursorBH,
      label: "B",
    });
  }
  return lines;
}

function _formatHz(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toPrecision(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toPrecision(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toPrecision(3)} kHz`;
  return `${hz.toPrecision(3)} Hz`;
}

export default Axes;

import type { KeyActionContext, KeyBinding, KeymapContext } from "./keymap-types";

function sortContexts(contexts: KeymapContext[]): KeymapContext[] {
  const order: Record<KeymapContext, number> = {
    modal: 0,
    "in-place-edit": 1,
    "drawing-wire": 2,
    "connected-block": 3,
    selection: 4,
    canvas: 5,
    global: 6,
  };
  return [...contexts].sort((left, right) => order[left] - order[right]);
}

export const keyBindings: KeyBinding[] = [
  { id: "file.new", label: "New model", chord: "Ctrl+N", contexts: ["global"] },
  { id: "file.open", label: "Open model", chord: "Ctrl+O", contexts: ["global"] },
  { id: "file.save", label: "Save current model", chord: "Ctrl+S", contexts: ["global"] },
  {
    id: "file.save-as",
    label: "Save current model as",
    chord: "Ctrl+Shift+S",
    contexts: ["global"],
  },
  { id: "file.export", label: "Export current model", chord: "Ctrl+Shift+E", contexts: ["global"] },
  { id: "file.close", label: "Close current model", chord: "Ctrl+W", contexts: ["global"] },
  { id: "file.print", label: "Print", chord: "Ctrl+P", contexts: ["global"] },
  { id: "file.switch-tab", label: "Switch tab", chord: "Ctrl+Shift+Tab", contexts: ["global"] },
  { id: "clipboard.cut", label: "Cut", chord: "Ctrl+X", contexts: ["global"] },
  { id: "clipboard.copy", label: "Copy", chord: "Ctrl+C", contexts: ["global"] },
  { id: "clipboard.paste", label: "Paste", chord: "Ctrl+V", contexts: ["global"] },
  { id: "selection.delete", label: "Delete selection", chord: "Delete", contexts: ["selection"] },
  {
    id: "selection.delete-backspace",
    label: "Delete selection",
    chord: "Backspace",
    contexts: ["selection"],
  },
  { id: "history.undo", label: "Undo", chord: "Ctrl+Z", contexts: ["global"] },
  { id: "history.redo", label: "Redo", chord: "Ctrl+Y", contexts: ["global"] },
  { id: "history.redo-alias", label: "Redo", chord: "Ctrl+Shift+Z", contexts: ["global"] },
  { id: "selection.select-all", label: "Select all", chord: "Ctrl+A", contexts: ["canvas"] },
  { id: "selection.clear", label: "Clear selection", chord: "Ctrl+Alt+A", contexts: ["canvas"] },
  {
    id: "selection.toggle-mode",
    label: "Toggle move vs select mode",
    chord: "M",
    contexts: ["global"],
  },
  {
    id: "selection.nudge",
    label: "Move selection by 1 grid step",
    chord: "Arrow",
    contexts: ["selection"],
  },
  {
    id: "selection.nudge-large",
    label: "Move selection by 10 grid steps",
    chord: "Shift+Arrow",
    contexts: ["selection"],
  },
  {
    id: "selection.move-cursor-nearest",
    label: "Move cursor to nearest element",
    chord: "Ctrl+Shift+Arrow",
    contexts: ["canvas"],
  },
  {
    id: "selection.top-left",
    label: "Select top-left element",
    chord: "Ctrl+Home",
    contexts: ["canvas"],
  },
  {
    id: "selection.bottom-right",
    label: "Select bottom-right element",
    chord: "Ctrl+End",
    contexts: ["canvas"],
  },
  {
    id: "selection.leftmost",
    label: "Select leftmost element",
    chord: "Home",
    contexts: ["canvas"],
  },
  {
    id: "selection.rightmost",
    label: "Select rightmost element",
    chord: "End",
    contexts: ["canvas"],
  },
  {
    id: "selection.extend-adjacent",
    label: "Extend selection to adjacent",
    chord: "Shift+Arrow",
    contexts: ["canvas"],
  },
  {
    id: "drag.constrain-axis",
    label: "Constrain drag to H/V axis",
    chord: "Space",
    contexts: ["selection"],
  },
  { id: "view.fit-diagram", label: "Fit diagram to window", chord: "Space", contexts: ["canvas"] },
  {
    id: "view.fit-selection",
    label: "Fit selection to window",
    chord: "Space+F",
    contexts: ["selection"],
  },
  { id: "view.zoom-100", label: "Zoom to 100%", chord: "Ctrl+0", contexts: ["canvas"] },
  { id: "view.zoom-100-space", label: "Zoom to 100%", chord: "Space+0", contexts: ["canvas"] },
  { id: "view.zoom-100-alt", label: "Zoom to 100%", chord: "Alt+1", contexts: ["canvas"] },
  { id: "view.zoom-in", label: "Zoom in", chord: "Ctrl++", contexts: ["canvas"] },
  { id: "view.zoom-in-space", label: "Zoom in", chord: "Space++", contexts: ["canvas"] },
  { id: "view.zoom-out", label: "Zoom out", chord: "Ctrl+-", contexts: ["canvas"] },
  { id: "view.zoom-out-space", label: "Zoom out", chord: "Space+-", contexts: ["canvas"] },
  { id: "view.pan-page", label: "Pan by page", chord: "Shift+Space+Arrow", contexts: ["canvas"] },
  { id: "nav.enter", label: "Enter selected subsystem", chord: "Enter", contexts: ["selection"] },
  { id: "nav.leave", label: "Leave to parent", chord: "Esc", contexts: ["canvas"] },
  { id: "nav.back", label: "Navigation history back", chord: "Ctrl+[", contexts: ["global"] },
  { id: "nav.forward", label: "Navigation history forward", chord: "Ctrl+]", contexts: ["global"] },
  {
    id: "nav.look-under-mask",
    label: "Look under block mask",
    chord: "Ctrl+U",
    contexts: ["selection"],
  },
  {
    id: "nav.parent-library",
    label: "Go to parent library",
    chord: "Ctrl+L",
    contexts: ["selection"],
  },
  { id: "nav.model-explorer", label: "Open Model Explorer", chord: "Ctrl+H", contexts: ["global"] },
  {
    id: "library.open-browser",
    label: "Open Library Browser",
    chord: "Ctrl+Shift+L",
    contexts: ["global"],
  },
  { id: "palette.command", label: "Open command palette", chord: "Ctrl+.", contexts: ["canvas"] },
  {
    id: "palette.command-azerty",
    label: "Open command palette (AZERTY alias)",
    chord: "Ctrl+Shift+.",
    contexts: ["canvas"],
  },
  {
    id: "palette.quick-insert",
    label: "Quick Insert block search",
    chord: "Ctrl+.,Ctrl+.",
    contexts: ["canvas"],
  },
  {
    id: "palette.quick-insert-azerty",
    label: "Quick Insert block search (AZERTY alias)",
    chord: "Ctrl+Shift+.,Ctrl+Shift+.",
    contexts: ["canvas"],
  },
  {
    id: "inspector.toggle",
    label: "Open or hide Property Inspector",
    chord: "Ctrl+Shift+I",
    contexts: ["global"],
  },
  {
    id: "inspector.focus-main",
    label: "Set main parameter",
    chord: "Alt+Enter",
    contexts: ["selection"],
  },
  { id: "rename.selected", label: "Rename selected element", chord: "F2", contexts: ["selection"] },
  { id: "search.find", label: "Find string", chord: "Ctrl+F", contexts: ["global"] },
  {
    id: "canvas.tool-wire",
    label: "Activate Wire tool",
    chord: "",
    contexts: ["canvas"],
  },
  {
    id: "probe.add-voltage",
    label: "Add voltage probe",
    chord: "",
    contexts: ["canvas"],
  },
  {
    id: "probe.add-current",
    label: "Add current probe",
    chord: "",
    contexts: ["canvas"],
  },
  {
    id: "probe.delete",
    label: "Delete selected probe",
    chord: "",
    contexts: ["selection"],
  },
  {
    id: "wire.segment-drag",
    label: "Drag wire segment",
    chord: "",
    contexts: ["selection"],
  },
  {
    id: "wire.connect-selected",
    label: "Connect two selected blocks",
    chord: "Ctrl+Click",
    contexts: ["selection"],
  },
  {
    id: "wire.multi-port",
    label: "Multi-port chained connect",
    chord: "Shift+Click",
    contexts: ["drawing-wire"],
  },
  {
    id: "wire.tap-line",
    label: "Tap into existing signal line",
    chord: "Ctrl+Drag",
    contexts: ["selection"],
  },
  {
    id: "wire.disconnect-drag",
    label: "Disconnect block from neighbour",
    chord: "Shift+Drag",
    contexts: ["selection"],
  },
  {
    id: "wire.disconnect-keyboard",
    label: "Disconnect block by keyboard",
    chord: "Shift+Arrow",
    contexts: ["connected-block"],
  },
  {
    id: "wire.toggle-posture",
    label: "Toggle wire posture",
    chord: "/",
    contexts: ["drawing-wire"],
  },
  {
    id: "wire.comment-out",
    label: "Comment out blocks",
    chord: "Ctrl+Shift+Y",
    contexts: ["selection"],
  },
  {
    id: "wire.toggle-comment",
    label: "Toggle comment",
    chord: "Ctrl+Shift+X",
    contexts: ["selection"],
  },
  {
    id: "transform.rotate-cw",
    label: "Rotate clockwise 90°",
    chord: "Ctrl+R",
    contexts: ["selection"],
  },
  {
    id: "transform.rotate-ccw",
    label: "Rotate counter-clockwise 90°",
    chord: "Ctrl+Shift+R",
    contexts: ["selection"],
  },
  { id: "transform.flip", label: "Flip block", chord: "Ctrl+I", contexts: ["selection"] },
  {
    id: "transform.group",
    label: "Group selection into subsystem",
    chord: "Ctrl+G",
    contexts: ["selection"],
  },
  {
    id: "transform.auto-arrange",
    label: "Auto-arrange model",
    chord: "Ctrl+Shift+A",
    contexts: ["canvas"],
  },
  { id: "transform.hide-block", label: "Hide block", chord: "Ctrl+M", contexts: ["selection"] },
  {
    id: "positioning.align-left",
    label: "Align selection left",
    chord: "Ctrl+Alt+Left",
    contexts: ["selection"],
  },
  {
    id: "positioning.align-right",
    label: "Align selection right",
    chord: "Ctrl+Alt+Right",
    contexts: ["selection"],
  },
  {
    id: "positioning.align-top",
    label: "Align selection top",
    chord: "Ctrl+Alt+Up",
    contexts: ["selection"],
  },
  {
    id: "positioning.align-bottom",
    label: "Align selection bottom",
    chord: "Ctrl+Alt+Down",
    contexts: ["selection"],
  },
  {
    id: "positioning.distribute-h",
    label: "Distribute selection horizontally",
    chord: "Ctrl+Shift+9",
    contexts: ["selection"],
  },
  {
    id: "positioning.distribute-v",
    label: "Distribute selection vertically",
    chord: "Ctrl+Shift+0",
    contexts: ["selection"],
  },
  {
    id: "positioning.center-h",
    label: "Center selection horizontally",
    chord: "Ctrl+Alt+C",
    contexts: ["selection"],
  },
  {
    id: "positioning.center-v",
    label: "Center selection vertically",
    chord: "Ctrl+Alt+X",
    contexts: ["selection"],
  },
  { id: "validate.update-diagram", label: "Update diagram", chord: "Ctrl+D", contexts: ["global"] },
  { id: "simulate.start", label: "Start simulation", chord: "Ctrl+T", contexts: ["global"] },
  { id: "simulate.start-f5", label: "Start simulation", chord: "F5", contexts: ["global"] },
  { id: "simulate.stop", label: "Stop simulation", chord: "Ctrl+Shift+T", contexts: ["global"] },
  {
    id: "simulate.config",
    label: "Open Configuration Parameters",
    chord: "Ctrl+E",
    contexts: ["global"],
  },
  {
    id: "simulate.build",
    label: "Build for code generation",
    chord: "Ctrl+B",
    contexts: ["global"],
  },
  {
    id: "simulate.refresh-model-refs",
    label: "Refresh model-reference blocks",
    chord: "Ctrl+K",
    contexts: ["global"],
  },
  { id: "debug.step-over", label: "Step over", chord: "F10", contexts: ["global"] },
  { id: "debug.step-in", label: "Step in", chord: "F11", contexts: ["global"] },
  { id: "debug.step-out", label: "Step out", chord: "Shift+F11", contexts: ["global"] },
  {
    id: "shell.toggle-primary",
    label: "Toggle primary side bar",
    chord: "F6",
    contexts: ["global"],
  },
  { id: "shell.toggle-bottom", label: "Toggle bottom panel", chord: "F7", contexts: ["global"] },
  {
    id: "shell.focus-output",
    label: "Focus output panel",
    chord: "Ctrl+`",
    contexts: ["global"],
  },
  {
    id: "shell.toggle-secondary",
    label: "Toggle secondary side bar",
    chord: "F8",
    contexts: ["global"],
  },
  {
    id: "shell.focus-activity-1",
    label: "Focus activity 1",
    chord: "Ctrl+Shift+1",
    contexts: ["global"],
  },
  {
    id: "shell.focus-activity-2",
    label: "Focus activity 2",
    chord: "Ctrl+Shift+2",
    contexts: ["global"],
  },
  {
    id: "shell.focus-activity-3",
    label: "Focus activity 3",
    chord: "Ctrl+Shift+3",
    contexts: ["global"],
  },
  {
    id: "shell.focus-activity-4",
    label: "Focus activity 4",
    chord: "Ctrl+Shift+4",
    contexts: ["global"],
  },
  {
    id: "shell.focus-tab-1",
    label: "Focus bottom tab 1",
    chord: "Ctrl+Shift+5",
    contexts: ["global"],
  },
  {
    id: "shell.focus-tab-2",
    label: "Focus bottom tab 2",
    chord: "Ctrl+Shift+6",
    contexts: ["global"],
  },
  {
    id: "shell.focus-tab-3",
    label: "Focus bottom tab 3",
    chord: "Ctrl+Shift+7",
    contexts: ["global"],
  },
  {
    id: "shell.focus-tab-4",
    label: "Focus bottom tab 4",
    chord: "Ctrl+Shift+8",
    contexts: ["global"],
  },
];

function chordSteps(chord: string): string[] {
  if (!chord) {
    return [];
  }
  if (chord.includes(",")) {
    return chord
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (chord.startsWith("Shift+Space+")) {
    return ["Shift+Space", chord.slice("Shift+Space+".length)];
  }
  if (chord.startsWith("Space+")) {
    return ["Space", chord.slice("Space+".length)];
  }
  return [chord];
}

function normalizeChord(chord: string, platform: KeyActionContext["platform"]): string {
  if (platform !== "mac") {
    return chord;
  }
  return chord.replaceAll("Ctrl+", "Meta+");
}

function normalizedSteps(binding: KeyBinding, platform: KeyActionContext["platform"]): string[] {
  return chordSteps(binding.chord).map((step) => normalizeChord(step, platform));
}

function matchesContext(candidate: KeyBinding, activeContext: KeymapContext): boolean {
  return candidate.contexts.includes(activeContext);
}

function findBindingForSteps(steps: string[], context: KeyActionContext): KeyBinding | null {
  for (const activeContext of sortContexts(context.activeContexts)) {
    const binding = keyBindings.find((candidate) => {
      const candidateSteps = normalizedSteps(candidate, context.platform);
      return (
        candidateSteps.length === steps.length &&
        candidateSteps.every((step, index) => step === steps[index]) &&
        matchesContext(candidate, activeContext)
      );
    });
    if (binding) {
      return binding;
    }
  }
  return (
    keyBindings.find((candidate) => {
      const candidateSteps = normalizedSteps(candidate, context.platform);
      return (
        candidateSteps.length === steps.length &&
        candidateSteps.every((step, index) => step === steps[index]) &&
        candidate.contexts.includes("global")
      );
    }) ?? null
  );
}

function hasSequencePrefix(steps: string[], context: KeyActionContext): boolean {
  for (const activeContext of sortContexts(context.activeContexts)) {
    const matched = keyBindings.some((candidate) => {
      const candidateSteps = normalizedSteps(candidate, context.platform);
      if (candidateSteps.length <= steps.length) {
        return false;
      }
      if (!matchesContext(candidate, activeContext) && !candidate.contexts.includes("global")) {
        return false;
      }
      return steps.every((step, index) => candidateSteps[index] === step);
    });
    if (matched) {
      return true;
    }
  }
  return false;
}

export interface KeyResolution {
  binding: KeyBinding | null;
  pending: string[];
  fallback: KeyBinding | null;
}

export function resolveBinding(
  chord: string,
  context: KeyActionContext,
  pending: string[] = [],
): KeyResolution {
  const current = normalizeChord(chord, context.platform);
  const seeded = pending.length > 0 ? [...pending, current] : [current];

  if (pending.length > 0) {
    const seededBinding = findBindingForSteps(seeded, context);
    if (seededBinding) {
      return { binding: seededBinding, pending: [], fallback: null };
    }
    if (hasSequencePrefix(seeded, context)) {
      return { binding: null, pending: seeded, fallback: null };
    }
    const directBinding = findBindingForSteps([current], context);
    if (directBinding) {
      if (hasSequencePrefix([current], context)) {
        return { binding: null, pending: [current], fallback: directBinding };
      }
      return { binding: directBinding, pending: [], fallback: null };
    }
    if (hasSequencePrefix([current], context)) {
      return { binding: null, pending: [current], fallback: null };
    }
    return { binding: null, pending: [], fallback: null };
  }

  const directBinding = findBindingForSteps([current], context);
  if (directBinding) {
    if (hasSequencePrefix([current], context)) {
      return { binding: null, pending: [current], fallback: directBinding };
    }
    return { binding: directBinding, pending: [], fallback: null };
  }

  return { binding: null, pending: [], fallback: null };
}

export function assertNoKeybindingConflicts(bindings: KeyBinding[]): void {
  const seen = new Map<string, string>();
  for (const binding of bindings) {
    const steps = chordSteps(binding.chord).join(">>");
    // Palette-only actions (no chord) cannot collide on a chord; skip them so
    // multiple chord-less actions may share a context (FE-106).
    if (steps.length === 0) {
      continue;
    }
    for (const context of binding.contexts) {
      const key = `${steps}@@${context}`;
      const existing = seen.get(key);
      if (existing) {
        throw new Error(`Duplicate key binding for ${key}: ${existing} and ${binding.id}`);
      }
      seen.set(key, binding.id);
    }
  }
}

const ROTATE_ACTION_IDS = new Set(["transform.rotate-cw", "transform.rotate-ccw"]);

/**
 * Guard against reintroducing the reference editor's bare single-letter rotate
 * (`R`). Rotation must stay on `Ctrl+R` / `Ctrl+Shift+R` per keyboard-map.md
 * §8; bare `R` is deliberately unbound (§13).
 */
export function assertNoBareLetterRotate(bindings: KeyBinding[]): void {
  for (const binding of bindings) {
    if (!ROTATE_ACTION_IDS.has(binding.id)) {
      continue;
    }
    if (/^[A-Za-z]$/.test(binding.chord)) {
      throw new Error(
        `Rotate action ${binding.id} must not bind a bare letter (${binding.chord}).`,
      );
    }
  }
}

export function getMatchingBinding(chord: string, context: KeyActionContext): KeyBinding | null {
  return resolveBinding(chord, context).binding;
}

assertNoKeybindingConflicts(keyBindings);
assertNoBareLetterRotate(keyBindings);

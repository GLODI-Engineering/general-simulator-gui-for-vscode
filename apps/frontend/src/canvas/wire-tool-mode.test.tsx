import { describe, it } from "vitest";

// FE-84, FE-85 — Canvas wire tool mode and toolbar affordance; Multi-click wire bends and posture toggle
// Scaffold-only tests. Implement full assertions from progress.frontend.yaml acceptance bullets.
// Acceptance checklist:
// - test_wire_toolbar_toggle: clicking Wire toggles canonical wire tool state and aria-pressed.
// - test_select_mode_port_drag: direct port dragging still starts/commits a wire in Select mode.
// - test_escape_cancels_wire_mode: Esc cancels in-progress wire state and resets active tool as specified.
// - test_no_default_w_binding: keymap has no default single-letter W wire binding.
// - test_multiclick_wire_route: explicit route stores expected integer waypoints.
// - test_posture_toggle: / changes preview bend order.

describe("FE-84, FE-85 scaffold", () => {
  it.todo("implement acceptance coverage");
});

import type { PortKind } from "../../model/types";

/**
 * Whether a port's name is drawn next to its terminal on the sheet.
 *
 * The two paradigms this canvas hosts want opposite answers.
 *
 * On a **signal-flow** block the port name is the whole interface: `d_A`,
 * `iq`, `theta_e`, `en` tell you what that input means, and a block diagram
 * with unnamed ports is unreadable. Simulink draws them, and so do we.
 *
 * On a **physical-electrical** part the port name is noise. No schematic in
 * any CAD tool prints `p`/`n` beside a resistor, `A`/`K` beside a diode, or
 * `c+`/`c-` beside a switch coil — the symbol's own geometry already says
 * which end is which (the diode's bar is the cathode; the source's `+` is
 * drawn inside the circle). Printing them put eight redundant glyphs on a
 * seven-component buck converter and crowded out the labels that do carry
 * information, the reference designator and the value.
 *
 * So the rule reads the port's domain, not the block's: a physical device
 * with a genuine signal input (a switch's gate drive, a controlled source's
 * command) still labels that one port, because there the name is the only
 * thing distinguishing it from the power terminals.
 */
export function shouldShowPortLabel(kind: PortKind): boolean {
  switch (kind.domain) {
    case "physical-electrical":
    case "physical-thermal":
    case "physical-translational":
    case "physical-rotational":
      return false;
    default:
      return true;
  }
}

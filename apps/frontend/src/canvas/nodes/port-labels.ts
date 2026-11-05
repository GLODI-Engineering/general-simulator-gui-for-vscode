import type { PortKind } from "../../model/types";

/**
 * Whether a port's name is drawn next to its terminal on the sheet.
 *
 * The two paradigms this canvas hosts want opposite answers.
 *
 * On a **signal-flow** block the port name is the whole interface: `d_A`,
 * `iq`, `theta_e`, `en` tell you what that input means, and a block diagram
 * with unnamed ports is unreadable. Conventional block-diagram editors draw them, and so do we.
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
export function shouldShowPortLabel(kind: PortKind, signalPortCount = 2): boolean {
  // A block with exactly one signal port does not need it named: an ideal
  // switch has a single gate, and a lone "gate" in small grey type beside a
  // power device whose other two pins are deliberately unlabelled reads as
  // debris rather than as information. Two or more and the names are doing
  // real work again — that is the case this rule exists for.
  if (signalPortCount < 2) {
    return false;
  }
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

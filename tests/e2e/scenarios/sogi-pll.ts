/**
 * The SOGI-PLL, drawn with the mouse.
 *
 * This file is the top layer: it names components and says what connects to
 * what, and contains no pointer arithmetic, no selectors and no waiting. If
 * something here reads like plumbing, it belongs in `actions/schematic.ts`.
 *
 * The circuit is the one in the TI-style reference design: a second-order
 * generalized integrator makes a quadrature pair out of one measured
 * voltage, a Park transform rotates that pair into the estimated frame, and
 * a PI loop filter drives the quadrature component to zero by steering the
 * frequency.
 *
 *     d(v_alpha)/dt = w * ( k * (v_in - v_alpha) - v_beta )
 *     d(v_beta)/dt  = w * v_alpha
 *     v_d           =  v_alpha*cos(th) + v_beta*sin(th)
 *     v_q           = -v_alpha*sin(th) + v_beta*cos(th)
 *     w             = w_n + Kp*v_q + Ki*integral(v_q)
 *     d(th)/dt      = w
 *
 * Every loop here closes through an integrator, and in this engine an
 * integrator does not break an algebraic loop — only an explicit one-sample
 * delay does. That is why DA, DB and DTH exist: each integrator's output is
 * read through a delay, uniformly, so "integrator state is read as it stood
 * at the end of the previous step" is a rule you can check rather than a
 * detail scattered through the sheet.
 */

import type { BlockHandle, SchematicPage } from "../actions/schematic";

export interface SogiPll {
  vin: BlockHandle;
  e1: BlockHandle;
  ksogi: BlockHandle;
  e2: BlockHandle;
  mulA: BlockHandle;
  intA: BlockHandle;
  da: BlockHandle;
  mulB: BlockHandle;
  intB: BlockHandle;
  db: BlockHandle;
  zero: BlockHandle;
  park: BlockHandle;
  gkp: BlockHandle;
  gki: BlockHandle;
  inti: BlockHandle;
  wnom: BlockHandle;
  wsum: BlockHandle;
  intTh: BlockHandle;
  dth: BlockHandle;
}

const SUM = "control.sum";
const GAIN = "control.gain";
const PRODUCT = "control.product";
const INTEGRATOR = "control.transfer_function";
const DELAY = "control.delay";
const CONST = "source.const";
const SINE = "source.sinwave";
const PARK = "control.transform.park";

/**
 * Place every block. Laid out as the signal flows — input on the left, the
 * SOGI across the top, the loop filter along the bottom — so a screenshot
 * of a failure is readable.
 */
export async function placeSogiPll(sheet: SchematicPage): Promise<SogiPll> {
  sheet.probe.trace.note("placing the SOGI front end");
  const vin = await sheet.add(SINE, 0.06, 0.18);
  const e1 = await sheet.add(SUM, 0.2, 0.18);
  const ksogi = await sheet.add(GAIN, 0.33, 0.18);
  const e2 = await sheet.add(SUM, 0.46, 0.18);
  const mulA = await sheet.add(PRODUCT, 0.59, 0.18);
  const intA = await sheet.add(INTEGRATOR, 0.72, 0.18);
  const da = await sheet.add(DELAY, 0.72, 0.42);
  const mulB = await sheet.add(PRODUCT, 0.76, 0.33);
  const intB = await sheet.add(INTEGRATOR, 0.88, 0.33);
  const db = await sheet.add(DELAY, 0.88, 0.5);

  sheet.probe.trace.note("placing the Park transform");
  const zero = await sheet.add(CONST, 0.06, 0.62);
  const park = await sheet.add(PARK, 0.2, 0.62);

  sheet.probe.trace.note("placing the loop filter and VCO");
  const gkp = await sheet.add(GAIN, 0.36, 0.55);
  const gki = await sheet.add(GAIN, 0.36, 0.78);
  const inti = await sheet.add(INTEGRATOR, 0.5, 0.78);
  const wnom = await sheet.add(CONST, 0.5, 0.95);
  const wsum = await sheet.add(SUM, 0.64, 0.78);
  const intTh = await sheet.add(INTEGRATOR, 0.78, 0.78);
  const dth = await sheet.add(DELAY, 0.86, 0.95);

  return {
    vin,
    e1,
    ksogi,
    e2,
    mulA,
    intA,
    da,
    mulB,
    intB,
    db,
    zero,
    park,
    gkp,
    gki,
    inti,
    wnom,
    wsum,
    intTh,
    dth,
  };
}

/**
 * Wire it up.
 *
 * `control.sum` and `control.product` generate their inputs from a
 * parameter rather than declaring them, so which port is "the second input"
 * is asked of the block rather than assumed.
 */
export async function wireSogiPll(sheet: SchematicPage, b: SogiPll): Promise<void> {
  sheet.probe.trace.note("wiring the SOGI");
  await sheet.wire(
    { block: b.vin, port: "out" },
    { block: b.e1, port: await sheet.inputPort(b.e1, 0) },
  );
  await sheet.wire({ block: b.intA, port: "out" }, { block: b.da, port: "in" });
  await sheet.wire(
    { block: b.da, port: "out" },
    { block: b.e1, port: await sheet.inputPort(b.e1, 1) },
  );
  await sheet.wire({ block: b.e1, port: "out" }, { block: b.ksogi, port: "in" });
  await sheet.wire(
    { block: b.ksogi, port: "out" },
    { block: b.e2, port: await sheet.inputPort(b.e2, 0) },
  );
  await sheet.wire({ block: b.intB, port: "out" }, { block: b.db, port: "in" });
  await sheet.wire(
    { block: b.db, port: "out" },
    { block: b.e2, port: await sheet.inputPort(b.e2, 1) },
  );
  await sheet.wire(
    { block: b.e2, port: "out" },
    { block: b.mulA, port: await sheet.inputPort(b.mulA, 0) },
  );
  await sheet.wire(
    { block: b.wsum, port: "out" },
    { block: b.mulA, port: await sheet.inputPort(b.mulA, 1) },
  );
  await sheet.wire({ block: b.mulA, port: "out" }, { block: b.intA, port: "in" });
  await sheet.wire(
    { block: b.da, port: "out" },
    { block: b.mulB, port: await sheet.inputPort(b.mulB, 0) },
  );
  await sheet.wire(
    { block: b.wsum, port: "out" },
    { block: b.mulB, port: await sheet.inputPort(b.mulB, 1) },
  );
  await sheet.wire({ block: b.mulB, port: "out" }, { block: b.intB, port: "in" });

  sheet.probe.trace.note("wiring the Park transform, on the delayed states");
  await sheet.wire({ block: b.da, port: "out" }, { block: b.park, port: "alpha" });
  await sheet.wire({ block: b.db, port: "out" }, { block: b.park, port: "beta" });
  await sheet.wire({ block: b.zero, port: "out" }, { block: b.park, port: "zero" });
  await sheet.wire({ block: b.intTh, port: "out" }, { block: b.dth, port: "in" });
  await sheet.wire({ block: b.dth, port: "out" }, { block: b.park, port: "theta" });

  sheet.probe.trace.note("wiring the loop filter and the VCO");
  await sheet.wire({ block: b.park, port: "q" }, { block: b.gkp, port: "in" });
  await sheet.wire({ block: b.park, port: "q" }, { block: b.gki, port: "in" });
  await sheet.wire({ block: b.gki, port: "out" }, { block: b.inti, port: "in" });
  await sheet.wire(
    { block: b.gkp, port: "out" },
    { block: b.wsum, port: await sheet.inputPort(b.wsum, 0) },
  );
  await sheet.wire(
    { block: b.inti, port: "out" },
    { block: b.wsum, port: await sheet.inputPort(b.wsum, 1) },
  );
  await sheet.wire(
    { block: b.wnom, port: "out" },
    { block: b.wsum, port: await sheet.inputPort(b.wsum, 2) },
  );
  await sheet.wire({ block: b.wsum, port: "out" }, { block: b.intTh, port: "in" });
}

/**
 * The constants, from the reference design.
 *
 * A 15 Hz loop bandwidth at a damping near 0.7, which settles in a few grid
 * cycles without much overshoot, and a grid sitting 2% low so the loop has
 * something to pull to.
 */
export const PLL = {
  gridHz: 49,
  nominalHz: 50,
  amplitudeV: 1,
  phaseDeg: 30,
  kSogi: Math.SQRT2,
  bandwidthHz: 15,
  // The Butterworth damping ratio, $\zeta = 1/\sqrt{2}$ — written as the exact
  // constant for the same reason `kSogi` above is, since 0.707 is the rounded
  // form of this number and not a separately chosen value.
  zeta: Math.SQRT1_2,
} as const;

export const KP = 2 * PLL.zeta * 2 * Math.PI * PLL.bandwidthHz;
export const KI = (2 * Math.PI * PLL.bandwidthHz) ** 2;
export const W_NOM = 2 * Math.PI * PLL.nominalHz;

/**
 * Parameters that decide the *shape* of a block, set before anything is
 * wired.
 *
 * `control.sum` draws one input per character of `signs`, so a three-input
 * adder does not exist until its signs say so — and the wire that would
 * have gone to the third input has nowhere to land. Setting these after
 * wiring would mean rewiring.
 */
export async function shapeSogiPll(sheet: SchematicPage, b: SogiPll): Promise<void> {
  sheet.probe.trace.note("setting the parameters that change port counts");
  await sheet.setParam(b.e1, "signs", "+-"); // v_in - v_alpha
  await sheet.setParam(b.e2, "signs", "+-"); // k*e1 - v_beta
  await sheet.setParam(b.wsum, "signs", "+++"); // w = Kp*vq + Ki*int(vq) + w_n
  // Put the rail away before wiring: it narrows the canvas, and a terminal
  // outside the visible area cannot be dragged to.
  await sheet.closeInspector();
}

/** The values, once the topology is right. */
export async function tuneSogiPll(sheet: SchematicPage, b: SogiPll): Promise<void> {
  sheet.probe.trace.note("tuning");
  await sheet.setParam(b.vin, "va", PLL.amplitudeV);
  await sheet.setParam(b.vin, "freq", PLL.gridHz);
  await sheet.setParam(b.vin, "phase", PLL.phaseDeg);
  await sheet.setParam(b.ksogi, "k", PLL.kSogi);
  await sheet.setParam(b.gkp, "k", KP);
  await sheet.setParam(b.gki, "k", KI);
  await sheet.setParam(b.wnom, "value", W_NOM);
  await sheet.setParam(b.zero, "value", 0);

  // Each integrator is 1/s. `control.integrator` compiles to the engine's
  // PID, which it treats as having direct feedthrough whatever the gains
  // are; a strictly proper 1/s has no feedthrough term at all, which is
  // what every loop here needs.
  for (const integrator of [b.intA, b.intB, b.inti, b.intTh]) {
    await sheet.setParam(integrator, "num", "1");
    await sheet.setParam(integrator, "den", "1, 0");
  }
  await sheet.closeInspector();
}

export async function buildSogiPll(
  sheet: SchematicPage,
  options: { tune?: boolean } = {},
): Promise<SogiPll> {
  const blocks = await placeSogiPll(sheet);
  await shapeSogiPll(sheet, blocks);
  await wireSogiPll(sheet, blocks);
  if (options.tune !== false) await tuneSogiPll(sheet, blocks);
  return blocks;
}

/** How many wires a complete SOGI-PLL has. */
export const SOGI_PLL_WIRE_COUNT = 25;
/** How many blocks. */
export const SOGI_PLL_BLOCK_COUNT = 19;

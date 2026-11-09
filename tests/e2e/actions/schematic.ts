/**
 * Schematic vocabulary, on top of `gs-ui-probe`.
 *
 * This is the middle layer: it knows what a block and a port are, and
 * nothing about any particular circuit. Scenarios — "build the converter",
 * "build the PLL" — are written in terms of these and contain no pointer
 * arithmetic of their own.
 *
 * ## The rule this file exists to keep
 *
 * Everything here that *acts* does so through the probe: real presses, real
 * travel, real releases. The suite this replaces had a test that moved the
 * mouse between two component centres and then called
 * `__gensim_wire_electrical(...)` to make the wire — it looked like a mouse
 * test and exercised none of the wiring.
 *
 * Reading state is different and is allowed to take a shortcut:
 * `__gensim_serialize()` returns the saved document, which is what the user
 * would get from File > Save. Asserting on it is asserting on the product's
 * own output, not on an internal the test reached into.
 */

import type { Locator, Page } from "@playwright/test";
import { Probe, type Target } from "gs-ui-probe";
import { canonicalType, paramLabel } from "./catalog";

export interface BlockInfo {
  id: string;
  type: string;
  position: [number, number];
  rotation: number;
  mirror: string;
  params: Record<string, unknown>;
}

export interface WireInfo {
  id: string;
  from: { block: string; port: string };
  to: { block: string; port: string };
  kind: string;
  net: string;
}

export interface PortInfo {
  blockId: string;
  portId: string;
  domain: string;
  direction: string;
  /** Viewport coordinates of the terminal, where a wire lands. */
  tip: { x: number; y: number };
}

export interface SchematicDocument {
  blocks: BlockInfo[];
  wires: WireInfo[];
  lines: unknown[];
  nets: unknown[];
}

/** A block, identified however the caller finds convenient. */
export type BlockRef = string | BlockHandle;

function idOf(ref: BlockRef): string {
  return typeof ref === "string" ? ref : ref.id;
}

export class BlockHandle {
  constructor(
    readonly schematic: SchematicPage,
    readonly id: string,
    readonly type: string,
  ) {}

  get locator(): Locator {
    return this.schematic.page.locator(`[data-block-id="${this.id}"]`);
  }

  /** A target that resolves to this port's terminal when the action runs. */
  port(portId: string): Target {
    return this.schematic.portTip(this.id, portId);
  }

  toString(): string {
    return `${this.type}`;
  }
}

export interface SchematicOptions {
  /**
   * How far off a terminal the pointer may land. The canvas hit-tests ports
   * within 20 model-pixels, so a few pixels of imprecision is realistic and
   * still lands — and if it ever stops landing, that is worth knowing.
   */
  jitterPx?: number;
  settleMs?: number;
  seed?: number;
  onAction?: (line: string) => void;
}

export class SchematicPage {
  readonly probe: Probe;

  constructor(
    readonly page: Page,
    options: SchematicOptions = {},
  ) {
    this.probe = new Probe(page, {
      jitterPx: options.jitterPx ?? 4,
      settleMs: options.settleMs ?? 80,
      seed: options.seed ?? 1,
      ...(options.onAction ? { onAction: (a) => options.onAction?.(JSON.stringify(a)) } : {}),
    });
  }

  // ── where things are ────────────────────────────────────────────────────

  get canvas(): Locator {
    return this.page.locator(".react-flow").first();
  }

  /**
   * Ports scoped to the canvas.
   *
   * The toolbar renders a live preview of every insertable component, and
   * those previews carry `[data-port-id]` too — eighteen of them before a
   * single block exists. An unscoped port selector finds the toolbar.
   */
  portElement(blockId: string, portId: string): Locator {
    return this.canvas.locator(`[data-block-id="${blockId}"] [data-port-id="${portId}"] circle`);
  }

  /**
   * A lazy target for a port's terminal.
   *
   * Lazy because the terminal moves: dragging the block, rotating it, or
   * panning the canvas all change where it is, and a scenario that resolved
   * it up front would aim at where it used to be.
   *
   * Measured in the page rather than through `locator.boundingBox()`. The
   * terminal's hit area is an SVG circle with `fill="none" stroke="none"` —
   * invisible but clickable, which is the standard way to give a drawn
   * symbol a generous target. Playwright's actionability check calls that
   * not visible and waits for it forever. `getBoundingClientRect()` answers
   * the only question being asked: where on screen is it.
   */
  portTip(blockId: string, portId: string): Target {
    const label = `${blockId.split("-")[0]}:${portId}`;
    return async () => {
      const point = await this.page.evaluate(
        ({ block, port }) => {
          const canvas = document.querySelector(".react-flow");
          const node = canvas?.querySelector(`[data-block-id="${block}"]`);
          const group = node?.querySelector(`[data-port-id="${port}"]`);
          const circle = group?.querySelector("circle");
          if (!circle) return null;
          const r = circle.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        },
        { block: blockId, port: portId },
      );
      if (!point) {
        const present = await this.ports();
        const onBlock = present
          .filter((p) => p.blockId === blockId)
          .map((p) => p.portId)
          .join(", ");
        throw new Error(
          `no terminal "${portId}" on block ${blockId}. ` +
            `It has: ${onBlock || "(no ports on the canvas)"}`,
        );
      }
      return point;
    };
  }

  /** Label for traces; the lazy target cannot carry one. */
  describePort(blockId: string, portId: string): string {
    return `${blockId.split("-")[0]}:${portId}`;
  }

  /**
   * The blocks the canvas is currently showing.
   *
   * Not the same question as `blocks()`. `__gensim_serialize()` returns the
   * whole saved document, which is the *root* sheet — step inside a
   * subsystem and it still reports the root's contents, because that is
   * what Save writes. What is on screen is the only way to ask "did
   * entering actually take me somewhere".
   */
  async visibleBlocks(): Promise<Array<{ id: string; type: string }>> {
    return await this.page.evaluate(() => {
      const canvas = document.querySelector(".react-flow");
      if (!canvas) return [];
      return [...canvas.querySelectorAll("[data-block-id]")].flatMap((el) => {
        const id = el.getAttribute("data-block-id");
        const type = el.getAttribute("data-block-type");
        return id && type ? [{ id, type }] : [];
      });
    });
  }

  /** Every port currently on the canvas, with its terminal position. */
  async ports(): Promise<PortInfo[]> {
    return await this.page.evaluate(() => {
      const canvas = document.querySelector(".react-flow");
      if (!canvas) return [];
      return [...canvas.querySelectorAll("[data-port-id]")].flatMap((p) => {
        const blockId = p.closest("[data-block-id]")?.getAttribute("data-block-id");
        const circle = p.querySelector("circle");
        if (!blockId || !circle) return [];
        const r = circle.getBoundingClientRect();
        return [
          {
            blockId,
            portId: p.getAttribute("data-port-id") ?? "",
            domain: p.getAttribute("data-port-domain") ?? "",
            direction: p.getAttribute("data-port-direction") ?? "",
            tip: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
          },
        ];
      });
    });
  }

  /**
   * The ports a block actually drew.
   *
   * Not the same as what the catalog declares: `control.sum` and
   * `control.product` list only their output, and generate `in0`, `in1`, …
   * from a parameter. A scenario that hard-codes those names is guessing.
   */
  async portsOf(ref: BlockRef): Promise<PortInfo[]> {
    const id = idOf(ref);
    return (await this.ports()).filter((p) => p.blockId === id);
  }

  /** The nth input port a block drew, in the order it drew them. */
  async inputPort(ref: BlockRef, index = 0): Promise<string> {
    const inputs = (await this.portsOf(ref)).filter((p) => p.direction === "in");
    const port = inputs[index];
    if (!port) {
      throw new Error(
        `block ${idOf(ref)} has ${inputs.length} input ports, no index ${index}. ` +
          `It drew: ${(await this.portsOf(ref)).map((p) => p.portId).join(", ")}`,
      );
    }
    return port.portId;
  }

  // ── reading the document ────────────────────────────────────────────────

  /**
   * The saved document — what File > Save would write.
   *
   * Asserting on this is asserting on the product's own output. It is the
   * one shortcut this layer takes, and it is a read, never an action.
   */
  async document(): Promise<SchematicDocument> {
    const text = await this.page.evaluate(() => {
      const win = globalThis as { __gensim_serialize?: () => string };
      return win.__gensim_serialize?.() ?? "";
    });
    if (!text) throw new Error("the app exposed no document to read");
    const parsed = JSON.parse(text) as { model: SchematicDocument };
    return parsed.model;
  }

  async blocks(): Promise<BlockInfo[]> {
    return (await this.document()).blocks;
  }

  async wires(): Promise<WireInfo[]> {
    return (await this.document()).wires;
  }

  async blockCount(): Promise<number> {
    return (await this.blocks()).length;
  }

  async wireCount(): Promise<number> {
    return (await this.wires()).length;
  }

  /** The most recently added block, as a handle. */
  async lastBlock(): Promise<BlockHandle> {
    const blocks = await this.blocks();
    const last = blocks.at(-1);
    if (!last) throw new Error("no blocks on the sheet");
    return new BlockHandle(this, last.id, last.type);
  }

  /** The one block of this type, or the nth if there are several. */
  async blockOfType(type: string, index = 0): Promise<BlockHandle> {
    const matches = (await this.blocks()).filter((b) => b.type === type);
    const found = matches[index];
    if (!found) {
      const available = [...new Set((await this.blocks()).map((b) => b.type))].join(", ");
      throw new Error(
        `no block ${index} of type "${type}" on the sheet. Present: ${available || "(none)"}`,
      );
    }
    return new BlockHandle(this, found.id, found.type);
  }

  // ── inserting ───────────────────────────────────────────────────────────

  /**
   * Click one of the toolbar's component buttons, as a user would.
   *
   * `title` is the button's own label: "Resistor", "Capacitor", "MOSFET
   * N-ch", and so on.
   */
  async insertFromToolbar(title: string): Promise<BlockHandle> {
    const before = await this.blockCount();
    await this.probe.click(this.page.getByRole("button", { name: `Insert ${title}` }));
    await this.waitForBlockCount(before + 1, `inserting ${title} from the toolbar`);
    return await this.lastBlock();
  }

  /**
   * Insert by searching, the way anything outside the eight toolbar
   * shortcuts has to be reached.
   *
   * Two things about Quick Insert that a test has to know, because getting
   * either wrong looks like the component simply does not exist:
   *
   * 1. It is a *double* chord — `Ctrl+Shift+.` twice. Pressed once it opens
   *    the command palette, a different dialog with a different
   *    placeholder, and a test that does that waits forever for a search
   *    box that is never coming.
   * 2. A component with several fidelity variants does not insert on Enter.
   *    Enter expands a variant list, whose entries are buttons that must be
   *    clicked — the list has no keyboard handling of its own. So "resistor"
   *    plus Enter adds nothing at all, which is indistinguishable from a
   *    failed search unless you know to look for the picker.
   */
  async insertByName(query: string, options: { variant?: string } = {}): Promise<BlockHandle> {
    const before = await this.blockCount();
    await this.focusCanvas();
    await this.probe.press(["Control+Shift+.", "Control+Shift+."]);

    const search = this.page.getByPlaceholder(/search blocks/i);
    await search.waitFor({ state: "visible", timeout: 5_000 });
    await search.fill(query);
    await this.page.waitForTimeout(250);
    await this.probe.press("Enter");

    await this.chooseVariantIfOffered(options.variant ?? query);
    await this.waitForBlockCount(before + 1, `inserting "${query}" via Quick Insert`);
    return await this.lastBlock();
  }

  /**
   * Click through the variant picker, if Enter raised one.
   *
   * Prefers the variant whose type is exactly what was asked for; falls
   * back to the first, which is what someone would do when they do not
   * care which fidelity they get.
   */
  private async chooseVariantIfOffered(wanted: string): Promise<void> {
    const picker = this.page.locator(".quick-insert__variants");
    try {
      await picker.waitFor({ state: "visible", timeout: 600 });
    } catch {
      return; // single-variant component: already inserted
    }

    const exact = picker.locator("button", {
      has: this.page.locator(`.quick-insert__item-meta:text-is("${wanted}")`),
    });
    const target = (await exact.count()) > 0 ? exact.first() : picker.locator("button").first();
    await this.probe.click(target);
  }

  /**
   * Insert exactly this component, and say so plainly if the search found
   * something else.
   *
   * Searching by name and taking whatever comes back is how a test ends up
   * quietly exercising a different component: "resistor" alone matches
   * `passive.resistor`, `passive.resistor.behavioral` and
   * `passive.resistor.semiconductor`, which have different parameters.
   *
   * The comparison is against the catalog's canonical name, not against
   * the spelling asked for. The engine owns component names and has
   * renamed some of them — a test may still ask for
   * `physical_electrical.passive.resistor`, the catalog resolves that
   * alias to `passive.resistor`, and the inserted block carries the
   * canonical name. Demanding a literal match would fail a test that got
   * exactly the component it meant.
   */
  async insertType(type: string): Promise<BlockHandle> {
    const canonical = canonicalType(type);
    const block = await this.insertByName(type, { variant: canonical });
    if (block.type !== canonical) {
      const asked =
        canonical === type ? `"${type}"` : `"${type}" (which the catalog calls "${canonical}")`;
      throw new Error(
        `asked Quick Insert for ${asked} and it inserted "${block.type}".\n\n` +
          this.probe.trace.format(),
      );
    }
    return block;
  }

  // ── acting on the canvas ────────────────────────────────────────────────

  /**
   * A point at a fractional position inside the canvas.
   *
   * Scenarios should say "put the source at the left, a third of the way
   * down" rather than "move it 340 px left of wherever it landed" —
   * relative offsets walk blocks off the edge, where their terminals have
   * no screen position and every later drag aims at nothing.
   */
  async canvasPoint(fx: number, fy: number): Promise<{ x: number; y: number }> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error("the canvas is not visible");
    // Inset, so a block centred here still has its terminals on screen.
    const inset = 90;
    const left = box.x + inset;
    const top = box.y + inset;
    const width = Math.max(1, box.width - inset * 2);
    const height = Math.max(1, box.height - inset * 2);
    return { x: left + width * fx, y: top + height * fy };
  }

  /** Drag a block so its centre lands at a fractional canvas position. */
  async place(ref: BlockRef, fx: number, fy: number): Promise<void> {
    await this.moveBlockTo(ref, await this.canvasPoint(fx, fy));
  }

  /**
   * Insert a component and put it somewhere on the canvas, in one step.
   *
   * The common shape of every scenario, and the one that keeps blocks from
   * piling up where the inserter happens to drop them — consecutive
   * inserts land close enough that one block's terminal can sit exactly on
   * another's, and a drag starting there is ambiguous about which it took.
   */
  async add(type: string, fx: number, fy: number): Promise<BlockHandle> {
    const block = await this.insertType(type);
    await this.place(block, fx, fy);
    return block;
  }

  /** Click empty canvas, so keyboard shortcuts reach it. */
  async focusCanvas(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error("the canvas is not visible");
    await this.probe.click({ x: box.x + box.width - 40, y: box.y + box.height - 40 });
  }

  /** Drag a block by a pixel offset. */
  async moveBlockBy(ref: BlockRef, dx: number, dy: number): Promise<void> {
    const id = idOf(ref);
    const node = this.canvas.locator(`[data-block-id="${id}"]`);
    await this.probe.dragBy(node, dx, dy, { holdMs: 80 });
  }

  /** Drag a block so its centre lands on a point. */
  async moveBlockTo(ref: BlockRef, to: { x: number; y: number }): Promise<void> {
    const id = idOf(ref);
    await this.probe.drag(this.canvas.locator(`[data-block-id="${id}"]`), to, { holdMs: 80 });
  }

  /**
   * Draw a wire, by dragging from one terminal to another.
   *
   * No hooks, no shortcuts: press on the source terminal, travel, release on
   * the target. Whether a wire appears is the canvas's decision, which is
   * the whole point — a rejected connection must be able to produce no wire.
   */
  async drawWire(
    from: { block: BlockRef; port: string },
    to: { block: BlockRef; port: string },
    options: { via?: Target[] } = {},
  ): Promise<void> {
    await this.probe.drag(
      this.portTip(idOf(from.block), from.port),
      this.portTip(idOf(to.block), to.port),
      { holdMs: 60, dropDelayMs: 60, ...(options.via ? { via: options.via } : {}) },
    );
  }

  /** Draw a wire and assert one appeared. */
  async wire(
    from: { block: BlockRef; port: string },
    to: { block: BlockRef; port: string },
    options: { via?: Target[] } = {},
  ): Promise<WireInfo> {
    const before = await this.wireCount();
    await this.drawWire(from, to, options);
    const after = await this.wires();
    if (after.length !== before + 1) {
      throw new Error(
        `dragging ${idOf(from.block)}:${from.port} -> ${idOf(to.block)}:${to.port} ` +
          `produced ${after.length - before} wires, expected 1.\n\n${this.probe.trace.format()}`,
      );
    }
    return after[after.length - 1] as WireInfo;
  }

  /** Draw a wire that is expected to be refused, and assert none appeared. */
  async expectWireRefused(
    from: { block: BlockRef; port: string },
    to: { block: BlockRef; port: string },
  ): Promise<void> {
    const before = await this.wireCount();
    await this.drawWire(from, to);
    const after = await this.wireCount();
    if (after !== before) {
      throw new Error(
        `${idOf(from.block)}:${from.port} -> ${idOf(to.block)}:${to.port} was connected, ` +
          "but the domains are incompatible and it should have been refused.",
      );
    }
  }

  /**
   * Empty the sheet, by selecting everything and deleting it.
   *
   * Through the UI rather than by reloading: a matrix test that reloads
   * between every pair spends most of its time booting, and select-all +
   * delete is an interaction worth exercising anyway.
   */
  async clearSheet(): Promise<void> {
    if ((await this.blockCount()) === 0) return;
    await this.selectAll();
    await this.deleteSelection();
    await this.page.waitForFunction(
      () => {
        const win = globalThis as { __gensim_serialize?: () => string };
        const text = win.__gensim_serialize?.();
        if (!text) return false;
        return (JSON.parse(text) as { model: { blocks: unknown[] } }).model.blocks.length === 0;
      },
      undefined,
      { timeout: 5_000 },
    );
  }

  /**
   * Insert two components and separate them, so their terminals are not on
   * top of each other.
   *
   * Needed because consecutive inserts land close enough that one block's
   * terminal can sit exactly on another's, and a drag that starts there is
   * ambiguous about which it grabbed.
   */
  async insertPairApart(
    first: string,
    second: string,
    gap = { x: 320, y: 200 },
  ): Promise<[BlockHandle, BlockHandle]> {
    const a = await this.insertType(first);
    const b = await this.insertType(second);
    await this.moveBlockBy(b, gap.x, gap.y);
    return [a, b];
  }

  // ── the property inspector ──────────────────────────────────────────────

  get inspector(): Locator {
    return this.page.locator(".inspector-slot, [data-testid='inspector']").first();
  }

  /** Make sure the inspector is showing. */
  async openInspector(): Promise<void> {
    if (await this.inspector.isVisible().catch(() => false)) return;
    await this.probe.press("Control+Shift+I");
    await this.inspector.waitFor({ state: "visible", timeout: 5_000 });
  }

  /**
   * Hide the inspector again.
   *
   * It occupies a fixed-width rail, so leaving it open narrows the canvas —
   * and a block placed near the right edge before it opened can end up
   * outside the visible area, where its terminals have no screen position
   * and every drag aimed at them hits nothing.
   */
  async closeInspector(): Promise<void> {
    if (!(await this.inspector.isVisible().catch(() => false))) return;
    await this.probe.press("Control+Shift+I");
    await this.page.waitForTimeout(300);
  }

  /** The parameter fields the inspector is showing, by their visible label. */
  async shownParams(): Promise<Record<string, string>> {
    return await this.page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const field of document.querySelectorAll(".inspector-field")) {
        const label = field.querySelector("span")?.textContent?.trim();
        const input = field.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
        if (label) out[label] = input?.value ?? "";
      }
      return out;
    });
  }

  /**
   * Set a parameter on a block, through the inspector.
   *
   * Takes the parameter's *name*, and finds the field by the label the UI
   * shows for it — they are not the same: `k` reads "Gain" and `n_inputs`
   * reads "Input count", so looking for a field called "k" finds nothing
   * and reports that the parameter does not exist.
   *
   * Committing matters too: these editors write back on blur or Enter, so
   * filling a box and moving on changes nothing.
   */
  async setParam(ref: BlockRef, name: string, value: string | number): Promise<void> {
    const block = await this.blockState(ref);
    const label = paramLabel(block.type, name);

    await this.selectBlock(ref);
    await this.openInspector();

    const field = this.page.locator(".inspector-field", {
      has: this.page.locator(`span:text-is("${label}")`),
    });
    try {
      await field.first().waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      const shown = Object.keys(await this.shownParams()).join(", ");
      throw new Error(
        `the inspector shows no field "${label}" (parameter "${name}") for ${block.type}. ` +
          `It shows: ${shown || "(none)"}`,
      );
    }

    const control = field.first().locator("input, select").first();
    const tag = await control.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      await control.selectOption(String(value));
    } else {
      await control.click();
      await control.fill(String(value));
      await this.probe.press("Enter");
    }
    await this.page.waitForTimeout(300);
  }

  /**
   * The netlist this document compiles to, right now.
   *
   * The Netlist tab only fills after a run, so "is the value I typed really
   * *used*?" could not be asked without a solver. This asks the compiler
   * directly, which is where the answer lives.
   */
  async netlist(): Promise<{ text: string; errors: string[] }> {
    return this.page.evaluate(() => {
      const door = (
        window as unknown as { __gensim_netlist?: () => { text: string; errors: string[] } }
      ).__gensim_netlist;
      if (!door) throw new Error("__gensim_netlist is not installed");
      return door();
    });
  }

  /** The netlist line for a block, by its refdes/label. */
  async netlistLineFor(label: string): Promise<string | null> {
    const { text } = await this.netlist();
    for (const line of text.split("\n")) {
      if (line.trim().startsWith(label)) return line.trim();
    }
    return null;
  }

  /** A parameter as the saved document records it. */
  async paramOf(ref: BlockRef, name: string): Promise<unknown> {
    return (await this.blockState(ref)).params?.[name];
  }

  /**
   * Press Run, the way a person does — the toolbar button, not a chord.
   *
   * The chord is F5. The original smoke test pressed Ctrl+T, which is not
   * bound to anything, so the run it was written to guard never happened.
   */
  async run(): Promise<void> {
    await this.probe.click(this.page.getByRole("button", { name: /^Run/ }));
  }

  /** How many samples the viewer is holding. */
  async waveformPointCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const win = globalThis as { __gensim_getWaveformPointCount?: () => number };
      return win.__gensim_getWaveformPointCount?.() ?? 0;
    });
  }

  /** Click Fit, so the whole sheet is in view. */
  async fitView(): Promise<void> {
    await this.probe.click(this.page.getByRole("button", { name: /^Fit/ }));
    await this.page.waitForTimeout(500);
  }

  /** Photograph the canvas. */
  async screenshot(path: string): Promise<void> {
    await this.canvas.screenshot({ path });
  }

  async selectAll(): Promise<void> {
    await this.focusCanvas();
    await this.probe.press("Control+A");
  }

  async deleteSelection(): Promise<void> {
    await this.probe.press("Delete");
  }

  async undo(): Promise<void> {
    await this.probe.press("Control+Z");
  }

  async redo(): Promise<void> {
    await this.probe.press("Control+Shift+Z");
  }

  async rotateSelection(direction: "cw" | "ccw" = "cw"): Promise<void> {
    await this.probe.press(direction === "cw" ? "Control+R" : "Control+Shift+R");
  }

  /** Flip the selection horizontally. */
  async flipSelection(): Promise<void> {
    await this.probe.press("Control+I");
  }

  /**
   * Group the selection into a subsystem.
   *
   * Needs at least two blocks selected; the handler returns without doing
   * anything for fewer, so a test that groups one block sees no error and
   * no subsystem.
   */
  async groupSelection(): Promise<BlockHandle> {
    const before = new Set((await this.blocks()).map((b) => b.id));
    await this.probe.press("Control+G");
    await this.page.waitForTimeout(400);
    const added = (await this.blocks()).filter((b) => !before.has(b.id));
    const subsystem = added[0];
    if (!subsystem) {
      throw new Error(`Ctrl+G added no subsystem.\n\n${this.probe.trace.format()}`);
    }
    return new BlockHandle(this, subsystem.id, subsystem.type);
  }

  /** Step into the selected subsystem. */
  async enterSubsystem(): Promise<void> {
    await this.probe.press("Enter");
    await this.page.waitForTimeout(400);
  }

  /** Step back out, the way the breadcrumb does. */
  async leaveSubsystem(): Promise<void> {
    await this.probe.press("Control+[");
    await this.page.waitForTimeout(400);
  }

  /** Where the canvas says we are, from the breadcrumb. */
  async breadcrumb(): Promise<string[]> {
    return await this.page.evaluate(() =>
      [...document.querySelectorAll(".breadcrumb button, .breadcrumb__item")]
        .map((el) => (el.textContent ?? "").trim())
        .filter(Boolean),
    );
  }

  async copy(): Promise<void> {
    await this.probe.press("Control+C");
  }

  async paste(): Promise<void> {
    await this.probe.press("Control+V");
  }

  /** Click a block to select it. */
  /**
   * Select a block, and make sure it really is the selected one.
   *
   * The click alone is not enough to trust. With the inspector open it
   * covers part of the canvas, so a block underneath it receives nothing and
   * the previous selection stands — after which `setParam` happily writes to
   * whichever block *was* selected. That is how a signal-flow PLL ended up
   * with three integrators at `1/s` and a fourth left at the default
   * `1/(s+1)`: one write went to a block that had already been set, and the
   * intended block was never touched. Nothing failed; the sheet was simply
   * wrong, and a low-pass sat where an integrator belonged.
   *
   * So: click, check, and if the selection did not take, get the block into
   * clear space and try once more before giving up loudly.
   */
  async selectBlock(ref: BlockRef): Promise<void> {
    const id = idOf(ref);
    await this.probe.click(this.canvas.locator(`[data-block-id="${id}"]`));
    if (await this.isSelected(id)) return;

    await this.closeInspector();
    await this.fitView();
    await this.probe.click(this.canvas.locator(`[data-block-id="${id}"]`));
    if (await this.isSelected(id)) return;

    throw new Error(
      `clicking ${id} did not select it — it is probably covered by a panel. ` +
        `Selection is: ${JSON.stringify(await this.selection())}`,
    );
  }

  /** Block ids the editor currently has selected. */
  async selection(): Promise<string[]> {
    return this.page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "[data-block-id].is-selected, [data-block-id][data-selected='true']",
        ),
      ].map((el) => el.getAttribute("data-block-id") ?? ""),
    );
  }

  private async isSelected(id: string): Promise<boolean> {
    await this.page.waitForTimeout(80);
    return (await this.selection()).includes(id);
  }

  /** The block as the document records it — position, rotation, mirror, params. */
  async blockState(ref: BlockRef): Promise<BlockInfo> {
    const id = idOf(ref);
    const found = (await this.blocks()).find((b) => b.id === id);
    if (!found) throw new Error(`block ${id} is no longer on the sheet`);
    return found;
  }

  /** Rubber-band select everything between two points. */
  async marqueeSelect(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await this.probe.marquee(from, to, { holdMs: 60 });
  }

  // ── waiting ─────────────────────────────────────────────────────────────

  private async waitForBlockCount(expected: number, what: string): Promise<void> {
    try {
      await this.page.waitForFunction(
        (want) => {
          const win = globalThis as { __gensim_serialize?: () => string };
          const text = win.__gensim_serialize?.();
          if (!text) return false;
          return (
            (JSON.parse(text) as { model: { blocks: unknown[] } }).model.blocks.length === want
          );
        },
        expected,
        { timeout: 8_000 },
      );
    } catch {
      throw new Error(
        `${what} did not add a block (still ${await this.blockCount()}).\n\n` +
          this.probe.trace.format(),
      );
    }
  }
}

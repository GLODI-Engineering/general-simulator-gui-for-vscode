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
      ...(options.onAction
        ? { onAction: (a) => options.onAction?.(JSON.stringify(a)) }
        : {}),
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
    return this.canvas.locator(
      `[data-block-id="${blockId}"] [data-port-id="${portId}"] circle`,
    );
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
   * Quick Insert is a *double* chord — `Ctrl+Shift+.` twice. Pressed once it
   * opens the command palette instead, which is a different dialog with a
   * different placeholder, and a test that does that waits forever for a
   * search box that is never going to appear.
   */
  async insertByName(query: string): Promise<BlockHandle> {
    const before = await this.blockCount();
    await this.focusCanvas();
    await this.probe.press(["Control+Shift+.", "Control+Shift+."]);

    const search = this.page.getByPlaceholder(/search blocks/i);
    await search.waitFor({ state: "visible", timeout: 5_000 });
    await search.fill(query);
    await this.page.waitForTimeout(250);
    await this.probe.press("Enter");

    await this.waitForBlockCount(before + 1, `inserting "${query}" via Quick Insert`);
    return await this.lastBlock();
  }

  // ── acting on the canvas ────────────────────────────────────────────────

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

  async rotateSelection(): Promise<void> {
    await this.probe.press("Control+R");
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
          return (JSON.parse(text) as { model: { blocks: unknown[] } }).model.blocks.length === want;
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

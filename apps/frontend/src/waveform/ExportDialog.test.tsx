import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportDialog, type ExportSubject } from "./ExportDialog";
import * as exportModule from "./export";
import type { WaveformSignal } from "./types";

function signal(name: string, unit: string, values: number[]): WaveformSignal {
  return {
    simId: "run-1",
    name,
    analysis: "tran",
    quantity: unit === "V" ? "voltage" : "current",
    unit,
    domain: "time",
    time: Float64Array.from(values.map((_, i) => i * 1e-6)),
    values: Float64Array.from(values),
  };
}

function subject(overrides: Partial<ExportSubject> = {}): ExportSubject {
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 50;
  return {
    kind: "axes",
    label: "V_out",
    canvases: () => [canvas],
    signals: () => [signal("V(out)", "V", [0, 1, 2, 3])],
    run: () => ({ id: "run-1", analysis: "TRAN" }),
    ...overrides,
  };
}

describe("image export", () => {
  it("selecting PDF and clicking Export downloads a file ending in .pdf", async () => {
    const fakeBlob = new Blob([], { type: "application/pdf" });
    vi.spyOn(exportModule, "exportAxes").mockResolvedValue(fakeBlob);
    const triggerDownload = vi.spyOn(exportModule, "triggerDownload").mockImplementation(() => {});

    render(<ExportDialog subject={subject()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: "PDF" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(exportModule.exportAxes).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ format: "pdf", background: "white" }),
    );
    expect(triggerDownload).toHaveBeenCalledWith(fakeBlob, "V_out.pdf");

    vi.restoreAllMocks();
  });

  it("hides the background selector for PDF, same as JPEG", () => {
    render(<ExportDialog subject={subject()} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "PDF" }));
    expect(screen.queryByLabelText("Background")).toBeNull();
  });

  it("stacks a figure's axes into one image rather than exporting only the first", () => {
    // A figure is the unit that goes in a report. Exporting one of its three
    // panes, silently, is the wrong answer to "export this figure".
    const canvases = [0, 1, 2].map(() => {
      const c = document.createElement("canvas");
      c.width = 120;
      c.height = 40;
      return c;
    });
    render(
      <ExportDialog
        subject={subject({ kind: "figure", label: "Buck", canvases: () => canvases })}
        onClose={() => {}}
      />,
    );
    // Natural size is the stack: widest by total height.
    expect((screen.getByLabelText("Width") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("Height") as HTMLInputElement).value).toBe("120");
  });
});

describe("data export", () => {
  it("writes a CSV of the signals, not a picture of them", async () => {
    const triggerDownload = vi.spyOn(exportModule, "triggerDownload").mockImplementation(() => {});

    render(<ExportDialog subject={subject()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    const [blob, filename] = triggerDownload.mock.calls[0] ?? [];
    expect(filename).toBe("V_out.csv");
    expect((blob as Blob).type).toMatch(/text\/csv/);

    vi.restoreAllMocks();
  });

  it("writes a result file that names itself .gsim_sim_result", async () => {
    const triggerDownload = vi.spyOn(exportModule, "triggerDownload").mockImplementation(() => {});

    render(<ExportDialog subject={subject()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Result file" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(triggerDownload.mock.calls[0]?.[1]).toBe("V_out.gsim_sim_result");

    vi.restoreAllMocks();
  });

  it("does not ask for DPI or pixel size when exporting numbers", () => {
    // A disabled DPI box is still a question asked. CSV has no DPI.
    render(<ExportDialog subject={subject()} onClose={() => {}} />);
    expect(screen.getByLabelText("DPI")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }));
    expect(screen.queryByLabelText("DPI")).toBeNull();
    expect(screen.queryByLabelText("Width")).toBeNull();
  });

  it("surfaces why an export failed instead of closing silently", async () => {
    // Signals of different lengths are not a table; the user needs to be
    // told that, not handed a truncated file.
    const mismatched = subject({
      signals: () => [signal("V(out)", "V", [0, 1, 2, 3]), signal("I(L1)", "A", [0, 1])],
    });
    const onClose = vi.fn();
    render(<ExportDialog subject={mismatched} onClose={onClose} />);

    fireEvent.click(screen.getByRole("radio", { name: "CSV" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("alert").textContent).toMatch(/I\(L1\)/);
    expect(onClose).not.toHaveBeenCalled();
  });
});

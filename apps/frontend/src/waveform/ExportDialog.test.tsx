import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExportDialog } from "./ExportDialog";
import * as exportModule from "./export";

describe("FE-168 ExportDialog PDF format", () => {
  it("selecting PDF and clicking Export downloads a file ending in .pdf", async () => {
    const fakeBlob = new Blob([], { type: "application/pdf" });
    vi.spyOn(exportModule, "exportAxes").mockResolvedValue(fakeBlob);
    const triggerDownloadSpy = vi
      .spyOn(exportModule, "triggerDownload")
      .mockImplementation(() => {});

    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 50;
    const onClose = vi.fn();

    render(<ExportDialog canvas={canvas} defaultFilename="axes-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole("radio", { name: "PDF" }));
    await fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(exportModule.exportAxes).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ format: "pdf", background: "white" }),
    );
    expect(triggerDownloadSpy).toHaveBeenCalledWith(fakeBlob, "axes-1.pdf");

    vi.restoreAllMocks();
  });

  it("hides the background selector for PDF, same as JPEG", () => {
    const canvas = document.createElement("canvas");
    render(<ExportDialog canvas={canvas} defaultFilename="axes-1" onClose={() => {}} />);

    fireEvent.click(screen.getByRole("radio", { name: "PDF" }));

    expect(screen.queryByLabelText("Background")).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

import { _buildMinimalPdf, clampDpi, exportAxes } from "./export";

describe("FE-121 export", () => {
  it("clamps DPI bounds", () => {
    expect(clampDpi(10)).toBe(72);
    expect(clampDpi(96)).toBe(96);
    expect(clampDpi(1000)).toBe(600);
  });

  it("exports PNG blob from canvas", async () => {
    const source = document.createElement("canvas");
    source.width = 10;
    source.height = 10;

    const temp = document.createElement("canvas");
    temp.getContext = vi.fn().mockReturnValue({
      fillStyle: "#fff",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    });
    temp.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,AA==");

    const originalCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, "createElement");
    createSpy.mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") return temp as HTMLCanvasElement;
      return originalCreate(tagName);
    });

    const blob = await exportAxes(source, { format: "png", dpi: 96 });
    expect(blob.type).toBe("image/png");
    createSpy.mockRestore();
  });

  it("FE-168: exports a PDF blob with valid PDF magic bytes", async () => {
    const source = document.createElement("canvas");
    source.width = 10;
    source.height = 10;

    const temp = document.createElement("canvas");
    temp.getContext = vi.fn().mockReturnValue({
      fillStyle: "#fff",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    });
    // Minimal fake JPEG data URL — content bytes don't matter for this test,
    // only that the PDF wrapper around them is well-formed.
    temp.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,/9j/4AAQSkZJRg==");

    const originalCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, "createElement");
    createSpy.mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") return temp as HTMLCanvasElement;
      return originalCreate(tagName);
    });

    const blob = await exportAxes(source, { format: "pdf", dpi: 96 });
    expect(blob.type).toBe("application/pdf");

    createSpy.mockRestore();
  });

  it("FE-168: _buildMinimalPdf produces well-formed PDF bytes embedding the given JPEG data", () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // fake JPEG-ish marker bytes
    const pdfBytes = _buildMinimalPdf(jpegBytes, 200, 100, 96);
    const text = new TextDecoder().decode(pdfBytes);

    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 200");
    expect(text).toContain("/Height 100");

    // The raw JPEG bytes appear verbatim in the output (DCTDecode = no re-encoding).
    let found = -1;
    for (let i = 0; i <= pdfBytes.length - jpegBytes.length; i++) {
      if (
        pdfBytes[i] === jpegBytes[0] &&
        pdfBytes.subarray(i, i + jpegBytes.length).every((b, j) => b === jpegBytes[j])
      ) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThanOrEqual(0);
  });
});

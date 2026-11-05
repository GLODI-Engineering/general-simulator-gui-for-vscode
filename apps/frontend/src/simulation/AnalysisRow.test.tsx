import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisRow } from "./AnalysisRow";

afterEach(cleanup);

function AnalysisRowHarness({ initialType }: { initialType: "OP" | "TRAN" | "AC" | "DC" }) {
  const [analysis, setAnalysis] = useState<{ id: string; type: string; [k: string]: unknown }>({
    id: "a1",
    type: initialType,
  });

  return (
    <AnalysisRow
      analysis={analysis}
      blockIds={["V1", "I1", "src1"]}
      onChange={(patch) => setAnalysis((prev) => ({ ...prev, ...patch }))}
    />
  );
}

describe("FE-61: AnalysisRow", () => {
  it("test_analysis_row_tran: selecting TRAN shows t_end, t_step, uic and hides AC/DC fields", () => {
    render(<AnalysisRowHarness initialType="OP" />);

    fireEvent.click(screen.getByRole("radio", { name: "TRAN" }));

    expect(screen.getByText("t_end")).toBeTruthy();
    expect(screen.getByText("t_step")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();

    expect(screen.queryByText("f_start")).toBeNull();
    expect(screen.queryByText("f_end")).toBeNull();
    expect(screen.queryByLabelText(/source/i)).toBeNull();
  });

  it("test_analysis_row_dc: selecting DC requires a source block id; invalid id shows an inline error", () => {
    render(<AnalysisRowHarness initialType="OP" />);

    fireEvent.click(screen.getByRole("radio", { name: "DC" }));

    const source = screen.getByLabelText(/source/i);
    fireEvent.change(source, { target: { value: "does-not-exist" } });
    fireEvent.blur(source);

    const inlineError = screen.queryByText(/invalid|unknown|required.*source/i);
    const invalidAttr = source.getAttribute("aria-invalid") === "true";

    expect(inlineError || invalidAttr).toBeTruthy();
  });
});

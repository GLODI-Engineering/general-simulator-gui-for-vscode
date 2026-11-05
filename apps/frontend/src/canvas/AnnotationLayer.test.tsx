/**
 * FE-59: AnnotationLayer tests
 *
 * Acceptance:
 * - test_annotation_inspector_style: changing font_size updates the rendered DOM attribute.
 * - test_annotation_z_order: annotation behind a block is occluded by the block.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnnotationInspector } from "../inspector/AnnotationInspector";
import { useGraphStore, useLibraryStore, useUiStore } from "../store";
import { AnnotationLayer } from "./AnnotationLayer";
import { Canvas } from "./Canvas";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
  useUiStore.setState(useUiStore.getInitialState());
  useLibraryStore.setState(useLibraryStore.getInitialState());
});

describe("FE-59: AnnotationLayer", () => {
  it("test_annotation_inspector_style: changing font_size from 12 to 16 updates rendered DOM attribute", async () => {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: {
        id: "model-1",
        name: "Untitled",
        grid: 10,
        params: [],
        blocks: [],
        wires: [],
        lines: [
          {
            id: "ann-text-1",
            kind: "text",
            position: [120, 80],
            text: "hello",
            style: { color: "#000000", font_size: 12, bold: false, italic: false },
          },
        ],
        nets: [],
        simulation: {},
        metadata: {},
      },
    });

    useUiStore.setState((state) => ({ ...state, selection: new Set(["ann-text-1"]) }));

    const { container } = render(
      <>
        <AnnotationLayer width={800} height={600} />
        <AnnotationInspector />
      </>,
    );

    const textNodeBefore = container.querySelector('[data-annotation-id="ann-text-1"]');
    expect(textNodeBefore).toHaveAttribute("data-font-size", "12");

    const fontInput = screen.getByLabelText(/font size/i);
    fireEvent.change(fontInput, { target: { value: "16" } });

    await waitFor(() => {
      const textNodeAfter = container.querySelector('[data-annotation-id="ann-text-1"]');
      expect(textNodeAfter).toHaveAttribute("data-font-size", "16");
    });
  });

  it("test_annotation_z_order: annotation layer is rendered below block layer, so blocks occlude annotations", () => {
    useGraphStore.getState().loadDocument({
      schema_version: 2,
      model: {
        id: "model-1",
        name: "Untitled",
        grid: 10,
        params: [],
        blocks: [
          {
            id: "b1",
            type: "test.block",
            position: [100, 100],
            rotation: 0,
            mirror: "none",
            params: {},
          },
        ],
        wires: [],
        lines: [
          {
            id: "ann-text-z",
            kind: "text",
            position: [100, 100],
            text: "behind",
            style: { color: "#000000", font_size: 12 },
          },
        ],
        nets: [],
        simulation: {},
        metadata: {},
      },
    });

    const { container } = render(<Canvas />);

    const annotationLayer = container.querySelector("svg.annotation-layer");
    const reactFlowLayer = container.querySelector(".react-flow");

    expect(annotationLayer).toBeInTheDocument();
    expect(reactFlowLayer).toBeInTheDocument();

    if (!(annotationLayer instanceof Element) || !(reactFlowLayer instanceof Element)) {
      throw new Error("Expected annotation and ReactFlow layers to exist");
    }

    const relation = annotationLayer.compareDocumentPosition(reactFlowLayer);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

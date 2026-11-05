/**
 * FE-59: AnnotationInspector — property panel for selected annotations.
 *
 * Renders style editors appropriate to each annotation kind:
 *   text     → color, font_size, bold, italic
 *   polyline → color, stroke_width, stroke_style, arrow_end
 *   rectangle/ellipse → color, fill, stroke_width, stroke_style
 */

import type { ParamValue } from "../model/types";
import { useGraphStore, useUiStore } from "../store";

function LabelRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inspector-field">
      <label className="inspector-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function patchAnnotationStyle(id: string, patch: Record<string, ParamValue>) {
  const graph = useGraphStore.getState();
  graph.transact("update annotation style", () => {
    const ann = graph.document.model.lines.find((l) => l.id === id);
    if (!ann) return;
    graph.updateAnnotation(id, {
      style: { ...(ann.style as Record<string, ParamValue> | undefined), ...patch },
    });
  });
}

export function AnnotationInspector() {
  const selection = useUiStore((state) => [...state.selection]);
  const lines = useGraphStore((state) => state.document.model.lines);

  // Only show when exactly one annotation is selected
  const selectedAnnotations = lines.filter((l) => selection.includes(l.id));

  if (selectedAnnotations.length === 0) {
    return null;
  }

  const ann = selectedAnnotations[0];
  if (!ann) return null;

  const style = (ann.style ?? {}) as Record<string, unknown>;

  const colorVal = (style.color as string | undefined) ?? "#000000";
  const strokeWidth = (style.stroke_width as number | undefined) ?? 1;
  const strokeStyle = (style.stroke_style as string | undefined) ?? "solid";

  const idBase = `annotation-${ann.id}`;

  const onColorChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patchAnnotationStyle(id, { color: e.target.value });

  const onStrokeWidthChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v > 0) patchAnnotationStyle(id, { stroke_width: v });
  };

  const onStrokeStyleChange = (id: string) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    patchAnnotationStyle(id, { stroke_style: e.target.value });

  return (
    <section className="inspector-panel" data-testid="annotation-inspector">
      <header className="inspector-panel__header">
        <strong>Annotation</strong>
        <span>{ann.kind}</span>
      </header>
      <div className="inspector-panel__body">
        {/* Color (all kinds) */}
        <LabelRow label="Color" htmlFor={`${idBase}-color`}>
          <input
            id={`${idBase}-color`}
            type="color"
            className="inspector-field__input"
            value={colorVal}
            onChange={onColorChange(ann.id)}
          />
        </LabelRow>

        {/* Text-specific */}
        {ann.kind === "text" && (
          <>
            <LabelRow label="Font size" htmlFor={`${idBase}-font-size`}>
              <input
                id={`${idBase}-font-size`}
                type="number"
                className="inspector-field__input"
                aria-label="Font size"
                min={6}
                max={72}
                value={(style.font_size as number | undefined) ?? 18}
                data-font-size={(style.font_size as number | undefined) ?? 18}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v >= 6 && v <= 72) patchAnnotationStyle(ann.id, { font_size: v });
                }}
              />
            </LabelRow>
            <LabelRow label="Bold" htmlFor={`${idBase}-bold`}>
              <input
                id={`${idBase}-bold`}
                type="checkbox"
                checked={!!style.bold}
                onChange={(e) => patchAnnotationStyle(ann.id, { bold: e.target.checked })}
              />
            </LabelRow>
            <LabelRow label="Italic" htmlFor={`${idBase}-italic`}>
              <input
                id={`${idBase}-italic`}
                type="checkbox"
                checked={!!style.italic}
                onChange={(e) => patchAnnotationStyle(ann.id, { italic: e.target.checked })}
              />
            </LabelRow>
          </>
        )}

        {/* Polyline-specific */}
        {ann.kind === "polyline" && (
          <>
            <LabelRow label="Stroke width" htmlFor={`${idBase}-stroke-width`}>
              <input
                id={`${idBase}-stroke-width`}
                type="number"
                className="inspector-field__input"
                min={0.5}
                max={10}
                step={0.5}
                value={strokeWidth}
                onChange={onStrokeWidthChange(ann.id)}
              />
            </LabelRow>
            <LabelRow label="Stroke style" htmlFor={`${idBase}-stroke-style`}>
              <select
                id={`${idBase}-stroke-style`}
                className="inspector-field__input"
                value={strokeStyle}
                onChange={onStrokeStyleChange(ann.id)}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </LabelRow>
            <LabelRow label="Arrow end" htmlFor={`${idBase}-arrow-end`}>
              <select
                id={`${idBase}-arrow-end`}
                className="inspector-field__input"
                value={(style.arrow_end as string | undefined) ?? "none"}
                onChange={(e) => patchAnnotationStyle(ann.id, { arrow_end: e.target.value })}
              >
                <option value="none">None</option>
                <option value="open">Open</option>
                <option value="filled">Filled</option>
              </select>
            </LabelRow>
          </>
        )}

        {/* Rectangle / ellipse */}
        {(ann.kind === "rectangle" || ann.kind === "ellipse") && (
          <>
            <LabelRow label="Fill" htmlFor={`${idBase}-fill`}>
              <input
                id={`${idBase}-fill`}
                type="color"
                className="inspector-field__input"
                value={
                  (style.fill as string | undefined) === "none" || !style.fill
                    ? "#ffffff"
                    : (style.fill as string)
                }
                onChange={(e) => patchAnnotationStyle(ann.id, { fill: e.target.value })}
              />
            </LabelRow>
            <LabelRow label="Stroke width" htmlFor={`${idBase}-stroke-width`}>
              <input
                id={`${idBase}-stroke-width`}
                type="number"
                className="inspector-field__input"
                min={0.5}
                max={10}
                step={0.5}
                value={strokeWidth}
                onChange={onStrokeWidthChange(ann.id)}
              />
            </LabelRow>
            <LabelRow label="Stroke style" htmlFor={`${idBase}-stroke-style`}>
              <select
                id={`${idBase}-stroke-style`}
                className="inspector-field__input"
                value={strokeStyle}
                onChange={onStrokeStyleChange(ann.id)}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </LabelRow>
          </>
        )}
      </div>
    </section>
  );
}

export default AnnotationInspector;

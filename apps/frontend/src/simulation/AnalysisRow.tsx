/**
 * FE-61: AnalysisRow — one row in the analyses list, with a type selector and
 * type-specific parameter fields.  Uses ParamExpressionInput for all numeric
 * values so identifiers and `{…}` expressions are accepted.
 */
import { useState } from "react";
import { ParamExpressionInput } from "../inspector/ParamExpressionInput";

export interface AnalysisData {
  id: string;
  type: string;
  [k: string]: unknown;
}

interface Props {
  analysis: AnalysisData;
  onChange?: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  params?: Record<string, number>;
  /** Used for validating DC sweep sources. */
  blockIds?: string[];
}

const ANALYSIS_TYPES = ["OP", "TRAN", "AC", "DC"] as const;

/** Standard SPICE AC sweep types: decade, octave, or linear point spacing. */
const AC_SWEEP_TYPES = ["DEC", "OCT", "LIN"] as const;

export function AnalysisRow({ analysis, onChange, onDelete, params = {}, blockIds = [] }: Props) {
  const type = analysis.type;

  const fieldId = (name: string) => `analysis-${analysis.id}-${name}`;

  const [dcSourceTouched, setDcSourceTouched] = useState(false);
  const dcSource = String(analysis.source ?? "");
  const dcSourceError =
    type !== "DC" || !dcSourceTouched
      ? ""
      : dcSource.trim() === ""
        ? "Source is required"
        : blockIds.length > 0 && !blockIds.includes(dcSource)
          ? "Unknown source block id"
          : "";

  return (
    <li className="analysis-row">
      <div className="analysis-row__header">
        <fieldset className="analysis-row__type">
          <legend>Type</legend>
          {ANALYSIS_TYPES.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name={`analysis-type-${analysis.id}`}
                value={t}
                checked={type === t}
                onChange={() => onChange?.({ type: t })}
              />
              {t}
            </label>
          ))}
        </fieldset>
        {onDelete && (
          <button type="button" aria-label="Delete analysis" onClick={onDelete}>
            ✕
          </button>
        )}
      </div>

      <div className="analysis-row__fields">
        {type === "TRAN" && (
          <>
            <div className="analysis-row__field">
              <label htmlFor={fieldId("t_end")}>t_end</label>
              <ParamExpressionInput
                id={fieldId("t_end")}
                ariaLabel="t_end"
                value={analysis.t_end as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ t_end: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("t_step")}>t_step</label>
              <ParamExpressionInput
                id={fieldId("t_step")}
                ariaLabel="t_step"
                value={analysis.t_step as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ t_step: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("uic")}>uic</label>
              <input
                id={fieldId("uic")}
                type="checkbox"
                checked={Boolean(analysis.uic)}
                onChange={(e) => onChange?.({ uic: e.currentTarget.checked })}
              />
            </div>
          </>
        )}

        {type === "AC" && (
          <>
            <div className="analysis-row__field">
              <label htmlFor={fieldId("sweep")}>sweep</label>
              <select
                id={fieldId("sweep")}
                value={String(analysis.sweep ?? "DEC")}
                onChange={(e) => onChange?.({ sweep: e.currentTarget.value })}
              >
                {AC_SWEEP_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("n_points")}>n_points</label>
              <ParamExpressionInput
                id={fieldId("n_points")}
                ariaLabel="n_points"
                value={analysis.n_points as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ n_points: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("f_start")}>f_start</label>
              <ParamExpressionInput
                id={fieldId("f_start")}
                ariaLabel="f_start"
                value={analysis.f_start as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ f_start: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("f_end")}>f_end</label>
              <ParamExpressionInput
                id={fieldId("f_end")}
                ariaLabel="f_end"
                value={analysis.f_end as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ f_end: v })}
              />
            </div>
          </>
        )}

        {type === "DC" && (
          <>
            <div className="analysis-row__field">
              <label htmlFor={fieldId("source")}>source</label>
              <input
                id={fieldId("source")}
                type="text"
                value={dcSource}
                placeholder="source block id"
                aria-invalid={dcSourceError ? true : undefined}
                onChange={(e) => onChange?.({ source: e.currentTarget.value })}
                onBlur={() => setDcSourceTouched(true)}
              />
              {dcSourceError ? <div className="analysis-row__error">{dcSourceError}</div> : null}
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("start")}>start</label>
              <ParamExpressionInput
                id={fieldId("start")}
                ariaLabel="start"
                value={analysis.start as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ start: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("stop")}>stop</label>
              <ParamExpressionInput
                id={fieldId("stop")}
                ariaLabel="stop"
                value={analysis.stop as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ stop: v })}
              />
            </div>

            <div className="analysis-row__field">
              <label htmlFor={fieldId("step")}>step</label>
              <ParamExpressionInput
                id={fieldId("step")}
                ariaLabel="step"
                value={analysis.step as string | number | undefined}
                params={params}
                onChange={(v) => onChange?.({ step: v })}
              />
            </div>
          </>
        )}
        {/* OP has no fields */}
      </div>
    </li>
  );
}

export default AnalysisRow;

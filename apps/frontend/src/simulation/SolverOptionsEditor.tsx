/**
 * FE-61: SolverOptionsEditor — edit solver tolerances and integration method.
 * Fields: abstol, reltol, vntol, method, method_options.
 */
import { ParamExpressionInput } from "../inspector/ParamExpressionInput";

export interface SolverOptions {
  abstol?: string | number;
  reltol?: string | number;
  vntol?: string | number;
  method?: string;
  method_options?: string;
}

interface Props {
  options?: SolverOptions;
  onChange?: (patch: Partial<SolverOptions>) => void;
}

const SOLVER_METHODS = ["gear", "trap", "be", "euler"] as const;

export function SolverOptionsEditor({ options = {}, onChange }: Props) {
  return (
    <div className="solver-options-editor">
      <div className="solver-options-editor__field">
        <label htmlFor="solver-abstol">abstol</label>
        <ParamExpressionInput
          id="solver-abstol"
          ariaLabel="abstol"
          value={options.abstol}
          onChange={(v) => onChange?.({ abstol: v })}
        />
      </div>

      <div className="solver-options-editor__field">
        <label htmlFor="solver-reltol">reltol</label>
        <ParamExpressionInput
          id="solver-reltol"
          ariaLabel="reltol"
          value={options.reltol}
          onChange={(v) => onChange?.({ reltol: v })}
        />
      </div>

      <div className="solver-options-editor__field">
        <label htmlFor="solver-vntol">vntol</label>
        <ParamExpressionInput
          id="solver-vntol"
          ariaLabel="vntol"
          value={options.vntol}
          onChange={(v) => onChange?.({ vntol: v })}
        />
      </div>

      <div className="solver-options-editor__field">
        <label htmlFor="solver-method">method</label>
        <select
          id="solver-method"
          value={String(options.method ?? "gear")}
          onChange={(e) => onChange?.({ method: e.currentTarget.value })}
        >
          {SOLVER_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="solver-options-editor__field">
        <label htmlFor="solver-method-options">method_options</label>
        <input
          id="solver-method-options"
          type="text"
          value={String(options.method_options ?? "")}
          onChange={(e) => onChange?.({ method_options: e.currentTarget.value })}
        />
      </div>
    </div>
  );
}

export default SolverOptionsEditor;

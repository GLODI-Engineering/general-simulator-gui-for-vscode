import { useState } from "react";

import { requestSource } from "../ipc/vscode-host";
import { type DerivedPorts, derivePortsFor } from "../netlist/code-ports";

interface SourcePortsProps {
  blockType: string;
  /** The block's `path` parameter — where its source lives. */
  sourcePath: string;
  /** Its `function` parameter, where the language has one. */
  functionName?: string;
  currentInputs: string[];
  currentOutputs: string[];
  onAdopt: (ports: { inputs?: string[]; outputs?: string[] }) => void;
}

const equal = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * What the source looks like it expects, beside what the block declares.
 *
 * A scripted block's ports live on the schematic and are handed to the
 * code, so the two can disagree with nothing noticing. This reads the file
 * and says what it found; adopting it is a click, never automatic, because
 * the parse is a shallow read of a signature and the person editing knows
 * things it does not — passing a vector through one port, for instance,
 * which is a perfectly ordinary thing to do.
 */
export function SourcePorts({
  blockType,
  sourcePath,
  functionName,
  currentInputs,
  currentOutputs,
  onAdopt,
}: SourcePortsProps) {
  const [state, setState] = useState<"idle" | "reading" | "done" | "unavailable">("idle");
  const [found, setFound] = useState<DerivedPorts | null>(null);

  async function read() {
    setState("reading");
    const text = await requestSource(sourcePath);
    if (text === null) {
      setState("unavailable");
      return;
    }
    setFound(derivePortsFor(blockType, text, functionName));
    setState("done");
  }

  const inputsDiffer =
    found?.inputs !== null && found?.inputs !== undefined
      ? !equal(found.inputs, currentInputs)
      : false;
  const outputsDiffer =
    found?.outputs !== null && found?.outputs !== undefined
      ? !equal(found.outputs, currentOutputs)
      : false;

  return (
    <div className="source-ports">
      <button type="button" className="source-ports__read" onClick={() => void read()}>
        {state === "reading" ? "Reading…" : "Read ports from source"}
      </button>

      {state === "unavailable" && (
        <p className="source-ports__note">
          The source can only be read inside the editor, where there is a workspace to read from.
        </p>
      )}

      {state === "done" && found && (
        <div className="source-ports__result">
          <p className="source-ports__note">{found.note}</p>
          {found.inputs === null && found.outputs === null ? null : (
            <>
              {found.inputs && (
                <p className={`source-ports__row${inputsDiffer ? " is-different" : ""}`}>
                  inputs: {found.inputs.join(", ")}
                  {inputsDiffer ? " — differs from this block" : " — matches"}
                </p>
              )}
              {found.outputs && (
                <p className={`source-ports__row${outputsDiffer ? " is-different" : ""}`}>
                  outputs: {found.outputs.join(", ")}
                  {outputsDiffer ? " — differs from this block" : " — matches"}
                </p>
              )}
              {(inputsDiffer || outputsDiffer) && (
                <button
                  type="button"
                  className="source-ports__adopt"
                  onClick={() =>
                    onAdopt({
                      ...(found.inputs && inputsDiffer ? { inputs: found.inputs } : {}),
                      ...(found.outputs && outputsDiffer ? { outputs: found.outputs } : {}),
                    })
                  }
                >
                  Use these ports
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SourcePorts;

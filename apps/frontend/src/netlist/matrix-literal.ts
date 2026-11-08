/**
 * Matrix and vector literals, in Python/NumPy form.
 *
 * One notation, deliberately. A state-space `A` written `[1 2; 3 4]` and the
 * same matrix written `[[1, 2], [3, 4]]` are both perfectly readable to a
 * person, and accepting both means every consumer — the netlist, the
 * engine, a script, a future exporter — has to agree on two grammars, and
 * silently disagree on the edge cases. Python form is the one enforced,
 * because the model is JSON and this is what JSON already looks like.
 *
 * MATLAB form is not merely rejected; it is *recognised* and named, because
 * "invalid matrix" to someone who has just typed a matrix that works
 * everywhere else is not a useful thing to be told. If there is ever a
 * community that wants it, this is the single place that changes.
 */

import { parseSpiceNumber } from "./spice-number";

export type MatrixParse = { ok: true; value: number[][] } | { ok: false; reason: string };

/** Semicolons separate rows in MATLAB and mean nothing in Python. */
const MATLAB_ROW_SEPARATOR = /;/;
/** `[1 2 3]` — MATLAB separates by space; Python needs commas. */
const SPACE_SEPARATED = /\d\s+[-+]?[\d.]/;

export function parseMatrixLiteral(raw: string): MatrixParse {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "Empty — write a matrix like [[1, 0], [0, 1]]" };

  if (MATLAB_ROW_SEPARATOR.test(text)) {
    return {
      ok: false,
      reason:
        "That is MATLAB form. Write it the Python way: rows in their own " +
        "brackets, separated by commas — [[1, 2], [3, 4]]",
    };
  }

  if (!text.startsWith("[") || !text.endsWith("]")) {
    return { ok: false, reason: "A matrix is bracketed, like [[1, 0], [0, 1]]" };
  }

  const inner = text.slice(1, -1).trim();
  if (inner === "") return { ok: false, reason: "A matrix needs at least one row" };

  // A row vector written flat is a shape mistake waiting to happen in a
  // state-space model, so it is named rather than guessed at.
  if (!inner.startsWith("[")) {
    if (SPACE_SEPARATED.test(inner)) {
      return {
        ok: false,
        reason: "That is MATLAB form. Python separates elements with commas — [[1, 2], [3, 4]]",
      };
    }
    return {
      ok: false,
      reason: `A matrix is a list of rows. For a single row write [[${inner}]]`,
    };
  }

  const rows: number[][] = [];
  let depth = 0;
  let current = "";
  for (const character of inner) {
    if (character === "[") {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        const row = parseRow(current);
        if (!row.ok) return row;
        rows.push(row.value);
        continue;
      }
    }
    if (depth === 0) {
      // Between rows only a comma and whitespace are allowed.
      if (character !== "," && character.trim() !== "") {
        return { ok: false, reason: `Unexpected "${character}" between rows` };
      }
      continue;
    }
    current += character;
  }

  if (depth !== 0) return { ok: false, reason: "Unbalanced brackets" };
  if (rows.length === 0) return { ok: false, reason: "A matrix needs at least one row" };

  const width = rows[0]?.length ?? 0;
  const ragged = rows.findIndex((row) => row.length !== width);
  if (ragged >= 0) {
    return {
      ok: false,
      reason: `Row ${ragged + 1} has ${rows[ragged]?.length} entries but row 1 has ${width} — every row must be the same length`,
    };
  }
  if (width === 0) return { ok: false, reason: "A row needs at least one entry" };

  return { ok: true, value: rows };
}

function parseRow(text: string): { ok: true; value: number[] } | { ok: false; reason: string } {
  const body = text.trim();
  if (body === "") return { ok: true, value: [] };
  if (SPACE_SEPARATED.test(body)) {
    return {
      ok: false,
      reason: "That is MATLAB form. Python separates elements with commas — [1, 2, 3]",
    };
  }
  const parts = body.split(",").map((part) => part.trim());
  const values: number[] = [];
  for (const part of parts) {
    if (part === "") return { ok: false, reason: "A row has an empty entry" };
    const parsed = parseSpiceNumber(part);
    if (parsed === null) return { ok: false, reason: `"${part}" is not a number` };
    values.push(parsed.value);
  }
  return { ok: true, value: values };
}

/** Write a matrix back in the one form this editor accepts. */
export function formatMatrixLiteral(value: number[][]): string {
  return `[${value.map((row) => `[${row.join(", ")}]`).join(", ")}]`;
}

/** Rows x columns, for showing the shape next to the box. */
export function matrixShape(value: number[][]): string {
  return `${value.length}x${value[0]?.length ?? 0}`;
}

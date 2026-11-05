export interface TranslatedError {
  summary: string;
  severity: "error" | "warning";
  details: string;
}

export const ERROR_MAP = [
  {
    pattern: /convergence failure/i,
    severity: "error" as const,
    summary: "Solver did not converge",
  },
  {
    pattern: /singular matrix/i,
    severity: "error" as const,
    summary: "Singular or ill-conditioned system",
  },
  {
    pattern: /timestep below minimum|dt=/i,
    severity: "warning" as const,
    summary: "Timestep became too small",
  },
];

export function translateError(raw: string): TranslatedError {
  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(raw)) {
      return { summary: entry.summary, severity: entry.severity, details: raw };
    }
  }
  return { summary: "Solver error", severity: "error", details: raw };
}

export const translate = translateError;

export default translateError;

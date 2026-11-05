export interface ProblemItem {
  id: string;
  severity: "error" | "warning" | "info";
  summary: string;
  blockId?: string;
}

export interface ProblemsStore {
  problems: ProblemItem[];
  badgeCount: number;
  hasErrors: boolean;
  setProblems: (problems: ProblemItem[]) => void;
  clear: () => void;
  setCompatWarnings: (blockIds: string[], simulatorLabel: string) => void;
  clearCompatWarnings: () => void;
}

const COMPAT_WARNING_PREFIX = "compat-warning:";

export function topologyIssuesToProblems(
  issues: Array<{
    id: string;
    severity: "error" | "warning" | "info";
    summary: string;
    blockId?: string;
  }>,
): ProblemItem[] {
  return issues.map((issue) => ({
    id: issue.id,
    severity: issue.severity,
    summary: issue.summary,
    blockId: issue.blockId,
  }));
}

export function createProblemsStore(): ProblemsStore {
  const store: ProblemsStore = {
    problems: [],
    badgeCount: 0,
    hasErrors: false,
    setProblems(problems) {
      store.problems = problems;
      store.badgeCount = problems.length;
      store.hasErrors = problems.some((problem) => problem.severity === "error");
    },
    clear() {
      store.problems = [];
      store.badgeCount = 0;
      store.hasErrors = false;
    },
    setCompatWarnings(blockIds, simulatorLabel) {
      const nonCompat = store.problems.filter((p) => !p.id.startsWith(COMPAT_WARNING_PREFIX));
      const warnings: ProblemItem[] = blockIds.map((blockId) => ({
        id: `${COMPAT_WARNING_PREFIX}${blockId}`,
        severity: "warning",
        summary: `${blockId} is not supported by ${simulatorLabel}`,
        blockId,
      }));
      const merged = [...nonCompat, ...warnings];
      store.problems = merged;
      store.badgeCount = merged.length;
      store.hasErrors = merged.some((problem) => problem.severity === "error");
    },
    clearCompatWarnings() {
      const filtered = store.problems.filter((p) => !p.id.startsWith(COMPAT_WARNING_PREFIX));
      store.problems = filtered;
      store.badgeCount = filtered.length;
      store.hasErrors = filtered.some((problem) => problem.severity === "error");
    },
  };
  return store;
}

export const useProblemsStore = createProblemsStore;

export default createProblemsStore;

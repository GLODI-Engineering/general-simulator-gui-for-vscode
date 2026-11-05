import type { ProblemItem } from "./problems-store";

export interface ProblemsViewProps {
  problems: ProblemItem[];
  onReveal: (blockId: string) => void;
}

export function ProblemsView({ problems, onReveal }: ProblemsViewProps) {
  if (problems.length === 0) {
    return <div className="problems-view__empty">No problems.</div>;
  }

  return (
    <div className="problems-view">
      {problems.map((problem) => (
        <div
          key={problem.id}
          className={`problems-view__item severity-${problem.severity}`}
          data-severity={problem.severity}
        >
          <div>{problem.summary}</div>
          <button type="button" onClick={() => problem.blockId && onReveal(problem.blockId)}>
            Reveal
          </button>
        </div>
      ))}
    </div>
  );
}

export default ProblemsView;

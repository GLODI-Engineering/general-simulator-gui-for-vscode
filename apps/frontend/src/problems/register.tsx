import { registerActivity } from "../shell/registries/ActivityRegistry";
import { registerBottomTab } from "../shell/registries/BottomTabRegistry";
import { useIpcStore, useUiStore } from "../store";
import { ProblemsView } from "./ProblemsView";

let registered = false;

function SharedProblemsPanel() {
  const problems = useIpcStore((state) =>
    state.problems.map((problem) => ({
      id: problem.id,
      severity: problem.severity,
      summary: problem.message,
      blockId: problem.id,
    })),
  );

  return (
    <ProblemsView
      problems={problems}
      onReveal={(blockId) => {
        useUiStore.getState().setSelection([blockId]);
      }}
    />
  );
}

export function registerProblemsSurface(): void {
  if (registered) {
    return;
  }
  registerActivity({
    id: "core.problems",
    label: "Problems",
    icon: "⚠",
    component: SharedProblemsPanel,
    order: 40,
  });
  registerBottomTab({
    id: "core.problems",
    label: "Problems",
    component: SharedProblemsPanel,
    order: 40,
    badge: () => useIpcStore.getState().problems.length,
  });
  registered = true;
}

export default registerProblemsSurface;

/**
 * FE-58: hierarchy-nav.ts
 *
 * Lightweight path-stack navigator for subsystem hierarchy editing.
 * Used by the canvas to track which subsystem body is currently being edited.
 *
 * The nav store is a plain object (no Zustand) so it can be used in both
 * React contexts (via useHierarchyNav hook) and pure logic tests.
 */

export interface NavStore {
  /** Ordered list of subsystem block ids from root to current depth. */
  readonly path: string[];
  /** Push a subsystem block id onto the stack (navigate into it). */
  push: (id: string) => void;
  /**
   * Pop back to the given index.
   * - popTo(0) → root (empty path)
   * - popTo(1) → keep only path[0]
   */
  popTo: (index: number) => void;
  /** Clear the stack entirely (return to root). */
  reset: () => void;
}

/**
 * Create a standalone nav store.
 * Tests use this directly; the canvas wraps it in a React ref.
 */
export function createNavStore(): NavStore {
  const store: NavStore & { path: string[] } = {
    path: [] as string[],
    push(id: string) {
      store.path = [...store.path, id];
    },
    popTo(index: number) {
      store.path = store.path.slice(0, index);
    },
    reset() {
      store.path = [];
    },
  };
  return store;
}

export default createNavStore;

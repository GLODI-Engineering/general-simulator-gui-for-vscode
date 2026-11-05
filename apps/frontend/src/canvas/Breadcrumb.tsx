/**
 * FE-58: Breadcrumb.tsx
 *
 * Breadcrumb navigation bar shown at the top of the canvas when the user
 * has navigated into a subsystem hierarchy.
 *
 * Example render: Root / Controller / PID Inner
 *
 * Clicking any crumb pops the path stack to that level:
 * - Clicking "Root" (index 0) → popTo(0) → empty stack (back at root)
 * - Clicking "Controller" (index 1) → popTo(1) → only "Controller" remains
 */

import type { Block } from "../model/types";

export interface BreadcrumbProps {
  /**
   * Ordered stack of subsystem block ids, outermost first.
   * An empty array means we are at root.
   */
  path: string[];
  /** All blocks in the root model document, used to resolve labels. */
  blocks: Block[];
  /** Root label shown as the first crumb. */
  rootLabel?: string;
  /** Called when the user clicks a crumb to navigate back. */
  onNavigate: (index: number) => void;
}

function labelForBlock(block: Block | undefined): string {
  if (!block) return "?";
  return block.label ?? block.id;
}

export function Breadcrumb({ path, blocks, rootLabel = "Root", onNavigate }: BreadcrumbProps) {
  // If we are at root with no path, no breadcrumb is needed
  if (path.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumb-nav" aria-label="Subsystem hierarchy">
      {/* Root crumb — clicking returns to root */}
      <button
        type="button"
        className="breadcrumb-nav__crumb breadcrumb-nav__crumb--root"
        onClick={() => onNavigate(0)}
      >
        {rootLabel}
      </button>

      {path.map((blockId, index) => {
        const block = blocks.find((b) => b.id === blockId);
        const isLast = index === path.length - 1;
        return (
          <span key={blockId} className="breadcrumb-nav__segment">
            <span className="breadcrumb-nav__separator" aria-hidden="true">
              {" / "}
            </span>
            {isLast ? (
              <span
                className="breadcrumb-nav__crumb breadcrumb-nav__crumb--current"
                aria-current="location"
              >
                {labelForBlock(block)}
              </span>
            ) : (
              <button
                type="button"
                className="breadcrumb-nav__crumb"
                onClick={() => onNavigate(index + 1)}
              >
                {labelForBlock(block)}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;

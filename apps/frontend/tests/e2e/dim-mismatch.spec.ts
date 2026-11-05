import { test } from "@playwright/test";

/**
 * FE-65 e2e: dim-mismatch at wire-draw
 *
 * Acceptance:
 * - Drag constant=[1,2,3] → math.gain → scope; verify wire shows '[3]' label
 *   after View → Signal dimensions is toggled.
 * - Drag from dim-[3] source to dim-[1] sink shows tooltip and refuses to commit.
 */

test.describe("FE-65: dim-mismatch", () => {
  test.skip("wire shows dim label after View → Signal dimensions toggle [planned]", async ({
    page,
  }) => {
    void page;
  });

  test.skip("drag from dim-[3] to dim-[1] shows mismatch tooltip and does not commit [planned]", async ({
    page,
  }) => {
    void page;
  });
});

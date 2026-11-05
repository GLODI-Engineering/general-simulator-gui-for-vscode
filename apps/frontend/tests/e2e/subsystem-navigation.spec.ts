import { test } from "@playwright/test";

/**
 * FE-58 e2e: subsystem navigation
 *
 * Acceptance:
 * - Build a 2-level hierarchy, navigate down and back up, verify state preserved
 *   and breadcrumb path correct.
 */

test.describe("FE-58: subsystem-navigation", () => {
  test.skip("navigate into subsystem and back, breadcrumb correct [planned]", async ({ page }) => {
    // Steps:
    // 1. Open app with a model containing a subsystem block.
    // 2. Double-click the subsystem block.
    // 3. Assert breadcrumb shows 'Root / SubsystemName'.
    // 4. Click root crumb.
    // 5. Assert breadcrumb is back to just 'Root'.
    void page;
  });

  test.skip("inner block changes preserved when navigating out and back in [planned]", async ({
    page,
  }) => {
    void page;
  });
});

import { expect, test } from "./fixtures/build";

test.describe("Subsystem navigation — web build", () => {
  test("e2e subsystem-navigation: 2-level down/up keeps state and breadcrumb path", async ({
    appPage,
  }) => {

    const hasHierarchyHooks = await appPage.evaluate(() => {
      const win = window as unknown as {
        __gensim_hierarchy_buildTwoLevel?: () => void;
        __gensim_hierarchy_open?: (id: string) => void;
        __gensim_hierarchy_breadcrumbTo?: (index: number) => void;
        __gensim_hierarchy_path?: () => string[];
        __gensim_serialize?: () => string;
      };
      return (
        typeof win.__gensim_hierarchy_buildTwoLevel === "function" &&
        typeof win.__gensim_hierarchy_open === "function" &&
        typeof win.__gensim_hierarchy_breadcrumbTo === "function" &&
        typeof win.__gensim_hierarchy_path === "function" &&
        typeof win.__gensim_serialize === "function"
      );
    });

    test.skip(!hasHierarchyHooks, "hierarchy e2e hooks are not available in this build");

    const hierarchyIds = await appPage.evaluate(() => {
      const win = window as unknown as {
        __gensim_hierarchy_buildTwoLevel?: () => void;
        __gensim_serialize?: () => string;
      };

      win.__gensim_hierarchy_buildTwoLevel?.();
      const docText = win.__gensim_serialize?.() ?? "{}";
      const doc = JSON.parse(docText) as {
        model?: {
          blocks?: Array<{
            id: string;
            type: string;
            subsystem?: { blocks?: Array<{ id: string; type: string }> };
          }>;
        };
      };

      const level1 =
        doc.model?.blocks?.find((b) => b.type.startsWith("hierarchy.subsystem.")) ?? null;
      const level2 =
        level1?.subsystem?.blocks?.find((b) => b.type.startsWith("hierarchy.subsystem.")) ?? null;

      return { level1: level1?.id ?? "", level2: level2?.id ?? "" };
    });

    expect(hierarchyIds.level1).not.toBe("");
    expect(hierarchyIds.level2).not.toBe("");

    await appPage.evaluate(({ level1, level2 }) => {
      const win = window as unknown as {
        __gensim_hierarchy_open?: (id: string) => void;
      };
      win.__gensim_hierarchy_open?.(level1);
      win.__gensim_hierarchy_open?.(level2);
    }, hierarchyIds);

    const pathAtDepth2 = await appPage.evaluate(() => {
      const win = window as unknown as { __gensim_hierarchy_path?: () => string[] };
      return win.__gensim_hierarchy_path?.() ?? [];
    });
    expect(pathAtDepth2).toEqual([hierarchyIds.level1, hierarchyIds.level2]);

    const snapshotBefore = await appPage.evaluate(() => {
      const win = window as unknown as { __gensim_serialize?: () => string };
      return win.__gensim_serialize?.() ?? "";
    });

    await appPage.evaluate(() => {
      const win = window as unknown as {
        __gensim_hierarchy_breadcrumbTo?: (index: number) => void;
      };
      win.__gensim_hierarchy_breadcrumbTo?.(0);
    });

    const pathAtRoot = await appPage.evaluate(() => {
      const win = window as unknown as { __gensim_hierarchy_path?: () => string[] };
      return win.__gensim_hierarchy_path?.() ?? [];
    });
    expect(pathAtRoot).toEqual([]);

    await appPage.evaluate(({ level1, level2 }) => {
      const win = window as unknown as { __gensim_hierarchy_open?: (id: string) => void };
      win.__gensim_hierarchy_open?.(level1);
      win.__gensim_hierarchy_open?.(level2);
    }, hierarchyIds);

    const snapshotAfter = await appPage.evaluate(() => {
      const win = window as unknown as { __gensim_serialize?: () => string };
      return win.__gensim_serialize?.() ?? "";
    });

    expect(snapshotAfter).toBe(snapshotBefore);
  });
});

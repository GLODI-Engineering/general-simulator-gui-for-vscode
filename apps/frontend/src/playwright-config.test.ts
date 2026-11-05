import { describe, expect, it } from "vitest";

import config from "../../../playwright.config";

describe("playwright matrix", () => {
  it("declares one project per browser engine and no host-specific target", () => {
    const names = config.projects?.map((project) => project.name) ?? [];

    expect(names).toEqual(["chromium", "firefox", "webkit"]);
  });

  it("points every project at the dev harness, not at a second host", () => {
    const baseUrls = (config.projects ?? []).map((project) => project.use?.baseURL);

    expect(new Set(baseUrls).size).toBe(1);
    expect(baseUrls[0]).toMatch(/^http:\/\/localhost:5173$|^http/);
  });
});

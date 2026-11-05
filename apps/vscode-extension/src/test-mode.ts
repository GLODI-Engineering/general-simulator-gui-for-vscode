/**
 * Single switch controlling everything test-only in this extension.
 *
 * Set by `@vscode/test-electron` via `extensionTestsEnv`. When it is off — i.e.
 * always, in a real user's VS Code — `activate()` returns nothing, webviews are
 * rendered without `testMode`, and the frontend's `installTestHooks()` is a
 * no-op.
 */
export function isIntegrationTest(): boolean {
  return process.env.GSIM_INTEGRATION_TEST === "1";
}

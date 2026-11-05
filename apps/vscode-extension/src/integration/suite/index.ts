/**
 * Mocha bootstrap, loaded by VS Code inside the extension host.
 */
import * as path from "node:path";

import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({
    // tdd, so the suite reads suite/test/suiteSetup — the VS Code convention.
    ui: "tdd",
    color: true,
    // Webviews have to boot a real React bundle; the default 2s is far too low.
    timeout: 90_000,
    slow: 10_000,
  });

  mocha.addFile(path.resolve(__dirname, "./gsim.suite.js"));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} integration test(s) failed`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

test("Quick Insert reaches a component the toolbar has no button for", async ({ appPage }) => {
  // The toolbar carries eight shortcuts. Everything else — every signal
  // block, every converter — is reached by searching, so if this does not
  // work most of the catalog is untestable by mouse.
  const sheet = new SchematicPage(appPage);
  const block = await sheet.insertType("converter.sig2phys");
  expect(block.type).toContain("sig2phys");
});

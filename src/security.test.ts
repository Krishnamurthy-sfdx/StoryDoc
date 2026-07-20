import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveContent, resolveStoryOutputDirectory, safeOutputSegment } from "./security.js";

test("sanitizes ticket values into a single safe output segment", () => {
  assert.equal(safeOutputSegment("../../APP-142"), "APP-142");
  assert.equal(resolveStoryOutputDirectory("/workspace", ".storydoc", "APP-142"), "/workspace/.storydoc/APP-142");
});

test("redacts credentials recursively from generated content", () => {
  const content = redactSensitiveContent({
    securityChanges: ["Authorization: Bearer abcdefghijklmnop1234"],
    notes: "PRIVATE_KEY=top-secret-value",
    nested: { token: "ghp_12345678901234567890" },
  });
  assert.match(content.securityChanges[0], /REDACTED BY STORYDOC/);
  assert.match(content.notes, /REDACTED BY STORYDOC/);
  assert.match(content.nested.token, /REDACTED BY STORYDOC/);
  assert.doesNotMatch(JSON.stringify(content), /abcdefghijklmnop1234|top-secret-value|ghp_/);
});

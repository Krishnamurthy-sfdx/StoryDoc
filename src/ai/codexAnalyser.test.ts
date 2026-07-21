import test from "node:test";
import assert from "node:assert/strict";
import { implementationAnalysisSchema } from "../schemas.js";
import { resolveStoryDocModelConfiguration, toCodexOutputSchema } from "./codexAnalyser.js";

test("uses Terra and concise Luna defaults", () => {
  const configuration = resolveStoryDocModelConfiguration({});
  assert.deepEqual(configuration, {
    requirements: { model: "gpt-5.6-terra", reasoningEffort: "low" },
    implementation: { model: "gpt-5.6-luna", reasoningEffort: "low" },
  });
});

test("allows model and reasoning overrides", () => {
  const configuration = resolveStoryDocModelConfiguration({
    STORYDOC_REQUIREMENTS_MODEL: "terra-custom",
    STORYDOC_REQUIREMENTS_REASONING_EFFORT: "medium",
    STORYDOC_IMPLEMENTATION_MODEL: "luna-custom",
    STORYDOC_IMPLEMENTATION_REASONING_EFFORT: "xhigh",
  });
  assert.equal(configuration.requirements.model, "terra-custom");
  assert.equal(configuration.requirements.reasoningEffort, "medium");
  assert.equal(configuration.implementation.model, "luna-custom");
  assert.equal(configuration.implementation.reasoningEffort, "xhigh");
});

test("rejects unsupported reasoning effort overrides", () => {
  assert.throws(() => resolveStoryDocModelConfiguration({ STORYDOC_IMPLEMENTATION_REASONING_EFFORT: "ultra" }), /must be one of/);
});

test("inlines nested definitions for Codex response schemas", () => {
  const outputSchema = toCodexOutputSchema(implementationAnalysisSchema);
  assert.doesNotMatch(JSON.stringify(outputSchema), /\"\$ref\"/);
});

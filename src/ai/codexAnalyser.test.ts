import test from "node:test";
import assert from "node:assert/strict";
import { implementationAnalysisSchema, requirementsExtractionSchema } from "../schemas.js";
import { CodexAnalyser, resolveStoryDocModelConfiguration, toCodexOutputSchema } from "./codexAnalyser.js";

test("uses Terra, Luna comparison, and a no-reasoning Luna overview by default", () => {
  const configuration = resolveStoryDocModelConfiguration({});
  assert.deepEqual(configuration, {
    requirements: { model: "gpt-5.6-terra", reasoningEffort: "low" },
    implementation: { model: "gpt-5.6-luna", reasoningEffort: "low" },
    solutionOverview: { model: "gpt-5.6-luna", reasoningEffort: "none" },
  });
});

test("allows model and reasoning overrides", () => {
  const configuration = resolveStoryDocModelConfiguration({
    STORYDOC_REQUIREMENTS_MODEL: "terra-custom",
    STORYDOC_REQUIREMENTS_REASONING_EFFORT: "medium",
    STORYDOC_IMPLEMENTATION_MODEL: "luna-custom",
    STORYDOC_IMPLEMENTATION_REASONING_EFFORT: "xhigh",
    STORYDOC_SOLUTION_OVERVIEW_MODEL: "luna-overview-custom",
    STORYDOC_SOLUTION_OVERVIEW_REASONING_EFFORT: "medium",
  });
  assert.equal(configuration.requirements.model, "terra-custom");
  assert.equal(configuration.requirements.reasoningEffort, "medium");
  assert.equal(configuration.implementation.model, "luna-custom");
  assert.equal(configuration.implementation.reasoningEffort, "xhigh");
  assert.equal(configuration.solutionOverview.model, "luna-overview-custom");
  assert.equal(configuration.solutionOverview.reasoningEffort, "medium");
});

test("uses the implementation Luna model and no reasoning for the overview unless specifically overridden", () => {
  const configuration = resolveStoryDocModelConfiguration({ STORYDOC_IMPLEMENTATION_MODEL: "luna-comparison-custom" });
  assert.equal(configuration.solutionOverview.model, "luna-comparison-custom");
  assert.equal(configuration.solutionOverview.reasoningEffort, "none");
});

test("rejects unsupported reasoning effort overrides", () => {
  assert.throws(() => resolveStoryDocModelConfiguration({ STORYDOC_IMPLEMENTATION_REASONING_EFFORT: "ultra" }), /must be one of/);
});

test("inlines nested definitions for Codex response schemas", () => {
  const outputSchema = toCodexOutputSchema(implementationAnalysisSchema);
  assert.doesNotMatch(JSON.stringify(outputSchema), /\"\$ref\"/);
});

test("does not retry a failed model request as a schema correction", async () => {
  let calls = 0;
  const analyser = new CodexAnalyser();
  const privateAnalyser = analyser as unknown as { runStructured: (...args: unknown[]) => Promise<unknown> };

  await assert.rejects(
    privateAnalyser.runStructured({
      run: async () => {
        calls += 1;
        throw new Error("Unsupported value: minimal");
      },
    }, "", requirementsExtractionSchema, "Luna overview", "gpt-5.6-luna"),
    /Luna overview request failed: Unsupported value: minimal/,
  );

  assert.equal(calls, 1);
});

test("retries a structurally valid response when supplied evidence validation fails", async () => {
  let calls = 0;
  const analyser = new CodexAnalyser();
  const privateAnalyser = analyser as unknown as { runStructured: (...args: unknown[]) => Promise<unknown> };
  const invalidResponse = JSON.stringify({ technicalDesignAdjustments: [{
    type: "implemented-differently",
    sectionHeading: "",
    sourceText: "Paraphrased Jira wording.",
    update: "The PR changes it.",
    evidencePaths: ["force-app/main/default/classes/Eligibility.cls"],
  }] });
  const correctedResponse = JSON.stringify({ technicalDesignAdjustments: [{
    type: "implemented-differently",
    sectionHeading: "",
    sourceText: "Literal Jira wording.",
    update: "The PR changes it.",
    evidencePaths: ["force-app/main/default/classes/Eligibility.cls"],
  }] });

  const result = await privateAnalyser.runStructured({
    run: async () => ({
      finalResponse: calls++ === 0 ? invalidResponse : correctedResponse,
      usage: null,
    }),
  }, "", implementationAnalysisSchema, "Luna comparison", "gpt-5.6-luna", (analysis: unknown) => {
    const sourceText = (analysis as { technicalDesignAdjustments: Array<{ sourceText: string }> }).technicalDesignAdjustments[0]?.sourceText;
    if (sourceText !== "Literal Jira wording.") throw new Error("Luna referenced Jira Technical Design text that was not supplied.");
  });

  assert.equal(calls, 2);
  assert.equal((result as { technicalDesignAdjustments: Array<{ sourceText: string }> }).technicalDesignAdjustments[0]?.sourceText, "Literal Jira wording.");
});

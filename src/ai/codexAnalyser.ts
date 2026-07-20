import { Codex, type ModelReasoningEffort } from "@openai/codex-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";
import { implementationAnalysisSchema, requirementsExtractionSchema, type ImplementationAnalysis, type RequirementsExtraction } from "../schemas.js";
import { assertDiffWithinLimit } from "../security.js";
import { analysisPrompt, requirementsPrompt } from "./prompts.js";

export type StoryDocModelConfiguration = {
  requirements: { model: string; reasoningEffort: ModelReasoningEffort };
  implementation: { model: string; reasoningEffort: ModelReasoningEffort };
};

const supportedReasoningEfforts = new Set<ModelReasoningEffort>(["minimal", "low", "medium", "high", "xhigh"]);

/** Terra handles the focused extraction task; Luna High handles implementation analysis. */
export function resolveStoryDocModelConfiguration(environment: NodeJS.ProcessEnv = process.env): StoryDocModelConfiguration {
  return {
    requirements: {
      model: environment.STORYDOC_REQUIREMENTS_MODEL ?? environment.STORYDOC_TERRA_MODEL ?? "gpt-5.6-terra",
      reasoningEffort: resolveReasoningEffort(environment.STORYDOC_REQUIREMENTS_REASONING_EFFORT, "low", "STORYDOC_REQUIREMENTS_REASONING_EFFORT"),
    },
    implementation: {
      model: environment.STORYDOC_IMPLEMENTATION_MODEL ?? environment.STORYDOC_LUNA_MODEL ?? "gpt-5.6-luna",
      reasoningEffort: resolveReasoningEffort(environment.STORYDOC_IMPLEMENTATION_REASONING_EFFORT, "high", "STORYDOC_IMPLEMENTATION_REASONING_EFFORT"),
    },
  };
}

export class CodexAnalyser {
  public constructor(_workingDirectory: string, private readonly models = resolveStoryDocModelConfiguration()) {}

  public async extractRequirements(story: { id: string; description: string; technicalDesign: string }): Promise<RequirementsExtraction> {
    return this.runInIsolatedWorkspace(this.models.requirements, requirementsPrompt(story), requirementsExtractionSchema, "Terra");
  }

  public async analyseImplementation(input: Parameters<typeof analysisPrompt>[0]): Promise<ImplementationAnalysis> {
    assertDiffWithinLimit(input.pullRequest.diff);
    return this.runInIsolatedWorkspace(this.models.implementation, analysisPrompt(input), implementationAnalysisSchema, "Luna");
  }

  private async runInIsolatedWorkspace<T>(model: { model: string; reasoningEffort: ModelReasoningEffort }, prompt: string, schema: ZodType<T>, modelName: string): Promise<T> {
    const isolatedWorkspace = await mkdtemp(join(tmpdir(), "storydoc-analysis-"));
    try {
      const thread = new Codex().startThread({
        model: model.model,
        modelReasoningEffort: model.reasoningEffort,
        workingDirectory: isolatedWorkspace,
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
        networkAccessEnabled: false,
        webSearchMode: "disabled",
        approvalPolicy: "never",
      });
      return await this.runStructured(thread, prompt, schema, modelName);
    } finally {
      await rm(isolatedWorkspace, { recursive: true, force: true });
    }
  }

  private async runStructured<T>(thread: ReturnType<Codex["startThread"]>, prompt: string, schema: ZodType<T>, modelName: string): Promise<T> {
    const outputSchema = zodToJsonSchema(schema, { target: "openAi" });
    let firstError = "";
    try {
      const turn = await thread.run(prompt, { outputSchema });
      return parseModelJson(turn.finalResponse, schema, modelName);
    } catch (error) {
      firstError = error instanceof Error ? error.message : String(error);
    }
    try {
      const correction = await thread.run(`Your previous response failed StoryDoc validation. Correct it once and return JSON only. Validation error: ${firstError}`, { outputSchema });
      return parseModelJson(correction.finalResponse, schema, modelName);
    } catch (error) {
      throw new Error(`${modelName} failed schema validation after one correction attempt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function resolveReasoningEffort(value: string | undefined, defaultValue: ModelReasoningEffort, variableName: string): ModelReasoningEffort {
  if (!value) return defaultValue;
  if (!supportedReasoningEfforts.has(value as ModelReasoningEffort)) throw new Error(`${variableName} must be one of: minimal, low, medium, high, xhigh.`);
  return value as ModelReasoningEffort;
}

function parseModelJson<T>(response: string, schema: ZodType<T>, modelName: string): T {
  try { return schema.parse(JSON.parse(response)); } catch (error) { throw new Error(`${modelName} returned data that did not match StoryDoc's schema: ${error instanceof Error ? error.message : String(error)}`); }
}

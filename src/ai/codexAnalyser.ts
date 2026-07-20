import { Codex, type ModelReasoningEffort, type Usage } from "@openai/codex-sdk";
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

export type StoryDocModelUsage = {
  stage: "Terra" | "Luna";
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  estimatedApiEquivalentCostUsd?: number;
};

// Temporary diagnostics: this is an API-equivalent estimate, not Codex-plan billing.

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
  public constructor(
    private readonly models = resolveStoryDocModelConfiguration(),
    private readonly reportUsage?: (usage: StoryDocModelUsage) => void,
  ) {}

  public async extractRequirements(story: { id: string; description: string; technicalDesign: string }): Promise<RequirementsExtraction> {
    return this.runInIsolatedWorkspace(this.models.requirements, requirementsPrompt(story), requirementsExtractionSchema, "Terra");
  }

  public async analyseImplementation(input: Parameters<typeof analysisPrompt>[0]): Promise<ImplementationAnalysis> {
    assertDiffWithinLimit(input.pullRequest.diff);
    return this.runInIsolatedWorkspace(this.models.implementation, analysisPrompt(input), implementationAnalysisSchema, "Luna");
  }

  private async runInIsolatedWorkspace<T>(model: { model: string; reasoningEffort: ModelReasoningEffort }, prompt: string, schema: ZodType<T>, modelName: "Terra" | "Luna"): Promise<T> {
    const isolatedWorkspace = await mkdtemp(join(tmpdir(), "storydoc-analysis-"));
    try {
      const thread = this.codexClient().startThread({
        model: model.model,
        modelReasoningEffort: model.reasoningEffort,
        workingDirectory: isolatedWorkspace,
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
        networkAccessEnabled: false,
        webSearchMode: "disabled",
        approvalPolicy: "never",
      });
      return await this.runStructured(thread, prompt, schema, modelName, model.model);
    } finally {
      await rm(isolatedWorkspace, { recursive: true, force: true });
    }
  }

  private codexClient(): Codex {
    const codexPathOverride = process.env.STORYDOC_CODEX_PATH;
    return codexPathOverride ? new Codex({ codexPathOverride }) : new Codex();
  }

  private async runStructured<T>(thread: ReturnType<Codex["startThread"]>, prompt: string, schema: ZodType<T>, modelName: "Terra" | "Luna", model: string): Promise<T> {
    const outputSchema = zodToJsonSchema(schema, { target: "openAi" });
    let firstError = "";
    let usage = emptyUsage();
    try {
      const turn = await thread.run(prompt, { outputSchema });
      usage = addUsage(usage, turn.usage);
      const result = parseModelJson(turn.finalResponse, schema, modelName);
      this.reportUsage?.(toUsageReport(modelName, model, usage));
      return result;
    } catch (error) {
      firstError = error instanceof Error ? error.message : String(error);
    }
    try {
      const correction = await thread.run(`Your previous response failed StoryDoc validation. Correct it once and return JSON only. Validation error: ${firstError}`, { outputSchema });
      usage = addUsage(usage, correction.usage);
      const result = parseModelJson(correction.finalResponse, schema, modelName);
      this.reportUsage?.(toUsageReport(modelName, model, usage));
      return result;
    } catch (error) {
      throw new Error(`${modelName} failed schema validation after one correction attempt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

type TokenUsage = Pick<Usage, "input_tokens" | "cached_input_tokens" | "output_tokens" | "reasoning_output_tokens">;

function emptyUsage(): TokenUsage {
  return { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
}

function addUsage(total: TokenUsage, usage: Usage | null): TokenUsage {
  if (!usage) return total;
  return {
    input_tokens: total.input_tokens + usage.input_tokens,
    cached_input_tokens: total.cached_input_tokens + usage.cached_input_tokens,
    output_tokens: total.output_tokens + usage.output_tokens,
    reasoning_output_tokens: total.reasoning_output_tokens + usage.reasoning_output_tokens,
  };
}

function toUsageReport(stage: "Terra" | "Luna", model: string, usage: TokenUsage): StoryDocModelUsage {
  const estimatedApiEquivalentCostUsd = estimateApiEquivalentCost(model, usage);
  return {
    stage,
    model,
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    outputTokens: usage.output_tokens,
    reasoningOutputTokens: usage.reasoning_output_tokens,
    ...(estimatedApiEquivalentCostUsd === undefined ? {} : { estimatedApiEquivalentCostUsd }),
  };
}

function estimateApiEquivalentCost(model: string, usage: TokenUsage): number | undefined {
  const rates = model === "gpt-5.6-terra" ? { input: 2.5, cachedInput: 0.25, output: 15 } : model === "gpt-5.6-luna" ? { input: 1, cachedInput: 0.1, output: 6 } : undefined;
  if (!rates) return undefined;
  const uncachedInputTokens = Math.max(0, usage.input_tokens - usage.cached_input_tokens);
  return (uncachedInputTokens * rates.input + usage.cached_input_tokens * rates.cachedInput + usage.output_tokens * rates.output) / 1_000_000;
}

function resolveReasoningEffort(value: string | undefined, defaultValue: ModelReasoningEffort, variableName: string): ModelReasoningEffort {
  if (!value) return defaultValue;
  if (!supportedReasoningEfforts.has(value as ModelReasoningEffort)) throw new Error(`${variableName} must be one of: minimal, low, medium, high, xhigh.`);
  return value as ModelReasoningEffort;
}

function parseModelJson<T>(response: string, schema: ZodType<T>, modelName: string): T {
  try { return schema.parse(JSON.parse(response)); } catch (error) { throw new Error(`${modelName} returned data that did not match StoryDoc's schema: ${error instanceof Error ? error.message : String(error)}`); }
}

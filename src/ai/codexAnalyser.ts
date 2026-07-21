import { Codex, type ModelReasoningEffort, type Usage } from "@openai/codex-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";
import {
  implementationAnalysisSchema,
  requirementsExtractionSchema,
  solutionOverviewSchema,
  type ImplementationAnalysis,
  type RequirementsExtraction,
  type SolutionOverview,
} from "../schemas.js";
import { validateFileEvidence } from "./evidenceValidator.js";
import { assertDiffWithinLimit } from "../security.js";
import { compressPullRequestInput } from "./diffCompression.js";
import { analysisPrompt, requirementsPrompt, solutionOverviewPrompt } from "./prompts.js";

export type StoryDocModelConfiguration = {
  requirements: { model: string; reasoningEffort: StoryDocReasoningEffort };
  implementation: { model: string; reasoningEffort: StoryDocReasoningEffort };
  solutionOverview: { model: string; reasoningEffort: StoryDocReasoningEffort };
};

export type StoryDocModelStage = "Terra" | "Luna comparison" | "Luna overview";
/** `none` is supported by the current Luna runtime but is absent from SDK 0.144.6's type union. */
export type StoryDocReasoningEffort = ModelReasoningEffort | "none";

export type StoryDocModelUsage = {
  stage: StoryDocModelStage;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  estimatedApiEquivalentCostUsd?: number;
};

// Temporary diagnostics: this is an API-equivalent estimate, not Codex-plan billing.

const supportedReasoningEfforts = new Set<StoryDocReasoningEffort>(["none", "minimal", "low", "medium", "high", "xhigh"]);

/** Terra extracts requirements; Luna compares the PR, then drafts a small final overview. */
export function resolveStoryDocModelConfiguration(environment: NodeJS.ProcessEnv = process.env): StoryDocModelConfiguration {
  return {
    requirements: {
      model: environment.STORYDOC_REQUIREMENTS_MODEL ?? environment.STORYDOC_TERRA_MODEL ?? "gpt-5.6-terra",
      reasoningEffort: resolveReasoningEffort(environment.STORYDOC_REQUIREMENTS_REASONING_EFFORT, "low", "STORYDOC_REQUIREMENTS_REASONING_EFFORT"),
    },
    implementation: {
      model: environment.STORYDOC_IMPLEMENTATION_MODEL ?? environment.STORYDOC_LUNA_MODEL ?? "gpt-5.6-luna",
      reasoningEffort: resolveReasoningEffort(environment.STORYDOC_IMPLEMENTATION_REASONING_EFFORT, "low", "STORYDOC_IMPLEMENTATION_REASONING_EFFORT"),
    },
    solutionOverview: {
      model: environment.STORYDOC_SOLUTION_OVERVIEW_MODEL ?? environment.STORYDOC_IMPLEMENTATION_MODEL ?? environment.STORYDOC_LUNA_MODEL ?? "gpt-5.6-luna",
      reasoningEffort: resolveReasoningEffort(environment.STORYDOC_SOLUTION_OVERVIEW_REASONING_EFFORT, "none", "STORYDOC_SOLUTION_OVERVIEW_REASONING_EFFORT"),
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
    const compression = compressPullRequestInput(input.pullRequest.changedFiles, input.pullRequest.diff);
    const filteredPaths = new Set(compression.filteredFiles.map((file) => file.path));
    const optimizedPullRequest = { ...input.pullRequest, changedFiles: compression.filteredFiles, diff: compression.compressedDiff };
    const optimizedInput = {
      ...input,
      pullRequest: optimizedPullRequest,
      classifiedFiles: input.classifiedFiles.filter((file) => filteredPaths.has(file.path)),
    };
    assertDiffWithinLimit(compression.compressedDiff);
    return this.runInIsolatedWorkspace(
      this.models.implementation,
      analysisPrompt(optimizedInput),
      implementationAnalysisSchema,
      "Luna comparison",
      (result) => validateFileEvidence(result, input.pullRequest.changedFiles, input.story.technicalDesign),
    );
  }

  public async draftSolutionOverview(input: Parameters<typeof solutionOverviewPrompt>[0]): Promise<SolutionOverview> {
    return this.runInIsolatedWorkspace(this.models.solutionOverview, solutionOverviewPrompt(input), solutionOverviewSchema, "Luna overview");
  }

  private async runInIsolatedWorkspace<T>(model: { model: string; reasoningEffort: StoryDocReasoningEffort }, prompt: string, schema: ZodType<T>, modelName: StoryDocModelStage, resultValidator?: (result: T) => void): Promise<T> {
    const isolatedWorkspace = await mkdtemp(join(tmpdir(), "storydoc-analysis-"));
    try {
      const thread = this.codexClient().startThread({
        model: model.model,
        // The current Luna runtime accepts "none", but the installed SDK's public
        // TypeScript union does not include it yet. Configuration is validated above.
        modelReasoningEffort: model.reasoningEffort as ModelReasoningEffort,
        workingDirectory: isolatedWorkspace,
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
        networkAccessEnabled: false,
        webSearchMode: "disabled",
        approvalPolicy: "never",
      });
      return await this.runStructured(thread, prompt, schema, modelName, model.model, resultValidator);
    } finally {
      await rm(isolatedWorkspace, { recursive: true, force: true });
    }
  }

  private codexClient(): Codex {
    const codexPathOverride = process.env.STORYDOC_CODEX_PATH;
    return codexPathOverride ? new Codex({ codexPathOverride }) : new Codex();
  }

  private async runStructured<T>(thread: ReturnType<Codex["startThread"]>, prompt: string, schema: ZodType<T>, modelName: StoryDocModelStage, model: string, resultValidator?: (result: T) => void): Promise<T> {
    const outputSchema = toCodexOutputSchema(schema);
    let usage = emptyUsage();

    let firstResponse: Awaited<ReturnType<typeof thread.run>>;
    try {
      firstResponse = await thread.run(prompt, { outputSchema });
    } catch (error) {
      throw new Error(`${modelName} request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    usage = addUsage(usage, firstResponse.usage);

    let firstValidationError = "";
    try {
      const result = parseModelJson(firstResponse.finalResponse, schema, modelName);
      resultValidator?.(result);
      this.reportUsage?.(toUsageReport(modelName, model, usage));
      return result;
    } catch (error) {
      firstValidationError = error instanceof Error ? error.message : String(error);
    }

    let correction: Awaited<ReturnType<typeof thread.run>>;
    try {
      correction = await thread.run(`Your previous response failed StoryDoc validation. Correct it once and return JSON only. Validation error: ${firstValidationError}`, { outputSchema });
    } catch (error) {
      throw new Error(`${modelName} correction request failed after an invalid response: ${error instanceof Error ? error.message : String(error)}`);
    }
    usage = addUsage(usage, correction.usage);

    try {
      const result = parseModelJson(correction.finalResponse, schema, modelName);
      resultValidator?.(result);
      this.reportUsage?.(toUsageReport(modelName, model, usage));
      return result;
    } catch (error) {
      throw new Error(`${modelName} failed StoryDoc validation after one correction attempt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Codex response schemas must not contain nested relative references. */
export function toCodexOutputSchema<T>(schema: ZodType<T>): ReturnType<typeof zodToJsonSchema> {
  return zodToJsonSchema(schema, { target: "openAi", $refStrategy: "none" });
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

function toUsageReport(stage: StoryDocModelStage, model: string, usage: TokenUsage): StoryDocModelUsage {
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

function resolveReasoningEffort(value: string | undefined, defaultValue: StoryDocReasoningEffort, variableName: string): StoryDocReasoningEffort {
  if (!value) return defaultValue;
  if (!supportedReasoningEfforts.has(value as StoryDocReasoningEffort)) throw new Error(`${variableName} must be one of: none, minimal, low, medium, high, xhigh.`);
  return value as StoryDocReasoningEffort;
}

function parseModelJson<T>(response: string, schema: ZodType<T>, modelName: string): T {
  try { return schema.parse(JSON.parse(response)); } catch (error) { throw new Error(`${modelName} returned data that did not match StoryDoc's schema: ${error instanceof Error ? error.message : String(error)}`); }
}

#!/usr/bin/env node
import { Command } from "commander";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CodexAnalyser, type StoryDocModelUsage } from "./ai/codexAnalyser.js";
import { compressPullRequestInput, type DiffCompressionResult } from "./ai/diffCompression.js";
import { loadLocalEnvironment } from "./config/localEnvironment.js";
import { validateFileEvidence } from "./ai/evidenceValidator.js";
import { buildDocumentationAnalysis } from "./documentation/buildAnalysis.js";
import { renderMarkdown } from "./documentation/render.js";
import { GitHubCliPullRequestProvider } from "./providers/githubCliProvider.js";
import { JiraStoryProvider } from "./providers/jiraProvider.js";
import { LocalFileStoryProvider } from "./providers/localFileStoryProvider.js";
import { LocalPullRequestProvider } from "./providers/localPullRequestProvider.js";
import { classifyChangedFiles } from "./salesforce/metadataClassifier.js";
import { redactSensitiveContent, resolveStoryOutputDirectory } from "./security.js";

const program = new Command().name("storydoc").description("Generate Salesforce technical documentation from a pull request");
program.command("generate").requiredOption("--pr <number>", "pull request number", parsePositiveInteger).requiredOption("--ticket <id>", "story or Jira ticket reference").option("--story-file <path>", "local Markdown story file").option("--design-file <path>", "local Markdown technical design file").option("--pr-file <path>", "local pull request JSON fixture for demos/tests").option("--output-dir <path>", "output directory", ".storydoc").option("--force", "overwrite existing generated files").option("--skip-ai", "write a structural report without Codex analysis").action(async (options: GenerateOptions) => {
  try { await generate(options); } catch (error) { console.error(`StoryDoc failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
});

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  await loadLocalEnvironment();
  await program.parseAsync(process.argv);
}

type GenerateOptions = { pr: number; ticket: string; storyFile?: string; designFile?: string; prFile?: string; outputDir: string; force?: boolean; skipAi?: boolean };

async function generate(options: GenerateOptions): Promise<void> {
  const workingDirectory = process.cwd();
  const reportProgress = (message: string) => console.log(message);
  const outputDirectory = resolveStoryOutputDirectory(workingDirectory, options.outputDir, options.ticket);
  const outputFiles = ["analysis.json", "technical-documentation.md", "usage.json", "compression-audit.json"].map((file) => resolve(outputDirectory, file));
  if (!options.force) await assertOutputDoesNotExist(outputDirectory, outputFiles);
  const prProvider = options.prFile ? new LocalPullRequestProvider(resolve(workingDirectory, options.prFile)) : new GitHubCliPullRequestProvider(workingDirectory, undefined, reportProgress);
  const storyProvider = options.storyFile ? new LocalFileStoryProvider(resolve(workingDirectory, options.storyFile), options.designFile ? resolve(workingDirectory, options.designFile) : undefined) : new JiraStoryProvider(undefined, reportProgress);
  console.log(`[1/8] Fetching pull request #${options.pr}...`);
  const pullRequest = await prProvider.getPullRequest(options.pr);
  console.log(`[1/8] Pull request loaded: ${pullRequest.changedFiles.length} changed files.`);
  console.log(`[2/8] Fetching story ${options.ticket} from ${options.storyFile ? "local files" : "Jira API"}...`);
  const story = await storyProvider.getStory(options.ticket);
  console.log(`[2/8] Story loaded: ${story.summary || story.id}.`);
  if (!story.technicalDesign.trim()) {
    throw new Error("Jira Technical Design is empty. StoryDoc preserves Jira's design and will not create a replacement document. Populate the Technical Design field or provide --design-file.");
  }
  console.log("[3/8] Classifying Salesforce components changed by the pull request...");
  const classifiedFiles = classifyChangedFiles(pullRequest.changedFiles);
  console.log(`[3/8] Classified ${classifiedFiles.length} changed files.`);
  const compression = compressPullRequestInput(pullRequest.changedFiles, pullRequest.diff);
  console.log(`[3/8] Compression preview: ${compression.originalFiles.length} files -> ${compression.filteredFiles.length}; ${formatBytes(compression.originalDiff)} diff -> ${formatBytes(compression.compressedDiff)}.`);
  // Temporary diagnostics: remove this collector, callback, and usage.json output when cost visibility is no longer needed.
  const modelUsage: StoryDocModelUsage[] = [];
  const analyser = new CodexAnalyser(undefined, (usage) => {
    modelUsage.push(usage);
    console.log(formatUsage(usage));
  });
  const requirements = options.skipAi ? skippedRequirements(story) : await extractRequirementsWithProgress(analyser, story);
  const implementation = options.skipAi ? skippedImplementation() : await analyseImplementationWithProgress(analyser, { story, requirements, pullRequest, classifiedFiles });
  console.log("[6/8] Validating component evidence against the pull request...");
  validateFileEvidence(implementation, pullRequest.changedFiles, story.technicalDesign);
  console.log("[6/8] Evidence validation complete.");
  const solutionOverview = options.skipAi ? skippedSolutionOverview() : await draftSolutionOverviewWithProgress(analyser, {
    story: { id: story.id, summary: story.summary },
    requirements,
    technicalDesignAdjustments: implementation.technicalDesignAdjustments,
  });
  if (modelUsage.length > 0) console.log(formatUsageTotal(modelUsage));
  const document = redactSensitiveContent(buildDocumentationAnalysis({ story, storyUrl: options.storyFile ? undefined : jiraStoryUrl(options.ticket), pullRequest, implementation, solutionOverview: solutionOverview?.solutionOverview }));
  console.log(`[8/8] Writing generated documentation to ${outputDirectory}...`);
  await mkdir(outputDirectory, { recursive: true });
  const compressionAudit = buildCompressionAudit(options.pr, compression);
  await Promise.all([
    writeFile(outputFiles[0], `${JSON.stringify(document, null, 2)}\n`, { flag: options.force ? "w" : "wx" }),
    writeFile(outputFiles[1], renderMarkdown(document), { flag: options.force ? "w" : "wx" }),
    writeFile(outputFiles[2], `${JSON.stringify({ modelUsage, estimatedApiEquivalentCostUsd: totalEstimatedCost(modelUsage), note: "Estimated using public API token rates. Actual Codex-plan billing may differ." }, null, 2)}\n`, { flag: options.force ? "w" : "wx" }),
    writeFile(outputFiles[3], `${JSON.stringify(redactSensitiveContent(compressionAudit), null, 2)}\n`, { flag: options.force ? "w" : "wx" }),
  ]);
  console.log(`Generated documentation in ${outputDirectory}`);
  console.log(`Compression audit written to ${outputFiles[3]}`);
}

async function assertOutputDoesNotExist(outputDirectory: string, outputFiles: string[]): Promise<void> {
  const existingFiles = await Promise.all(outputFiles.map(async (file) => { try { await access(file); return file; } catch { return ""; } }));
  if (existingFiles.some(Boolean)) throw new Error(`Output already exists in ${outputDirectory}. Use --force to overwrite existing files, or choose a different --ticket/--output-dir.`);
}

function buildCompressionAudit(prNumber: number, compression: DiffCompressionResult<{ path: string }>) {
  const originalBytes = Buffer.byteLength(compression.originalDiff, "utf8");
  const compressedBytes = Buffer.byteLength(compression.compressedDiff, "utf8");
  return {
    pullRequest: prNumber,
    before: { files: compression.originalFiles, diff: compression.originalDiff },
    after: { files: compression.filteredFiles, diff: compression.compressedDiff },
    metrics: {
      filesBefore: compression.originalFiles.length,
      filesAfter: compression.filteredFiles.length,
      diffBytesBefore: originalBytes,
      diffBytesAfter: compressedBytes,
      diffBytesRemoved: originalBytes - compressedBytes,
      diffReductionPercent: originalBytes === 0 ? 0 : Number(((1 - compressedBytes / originalBytes) * 100).toFixed(2)),
    },
  };
}

function formatBytes(value: string): string {
  return `${Buffer.byteLength(value, "utf8").toLocaleString()} bytes`;
}

async function extractRequirementsWithProgress(analyser: CodexAnalyser, story: { id: string; description: string; technicalDesign: string }) {
  console.log("[4/8] Terra: extracting acceptance criteria and technical-design references (configured reasoning effort)...");
  const stopPulse = startProgressPulse("Terra", "still extracting and structuring story requirements");
  try {
    const requirements = await analyser.extractRequirements(story);
    console.log(`[4/8] Terra complete: ${requirements.acceptanceCriteria.length} acceptance criteria and ${requirements.designDecisions.length} design decisions extracted.`);
    return requirements;
  } finally {
    stopPulse();
  }
}

async function analyseImplementationWithProgress(analyser: CodexAnalyser, input: Parameters<CodexAnalyser["analyseImplementation"]>[0]) {
  console.log("[5/8] Luna: comparing the Jira Technical Design with the changed pull-request files (configured reasoning effort)...");
  const stopPulse = startProgressPulse("Luna comparison", "still analyzing the pull-request diff and Salesforce metadata");
  try {
    const implementation = await analyser.analyseImplementation(input);
    console.log(`[5/8] Luna comparison complete: ${implementation.technicalDesignAdjustments.length} Jira technical-design updates identified.`);
    return implementation;
  } finally {
    stopPulse();
  }
}

async function draftSolutionOverviewWithProgress(analyser: CodexAnalyser, input: Parameters<CodexAnalyser["draftSolutionOverview"]>[0]) {
  console.log("[7/8] Luna: drafting the Solution Overview from validated requirements and pull-request updates (configured reasoning effort)...");
  const stopPulse = startProgressPulse("Luna overview", "still drafting the concise Solution Overview");
  try {
    const solutionOverview = await analyser.draftSolutionOverview(input);
    console.log(`[7/8] Luna overview complete: ${solutionOverview.solutionOverview.length.toLocaleString()} characters drafted.`);
    return solutionOverview;
  } finally {
    stopPulse();
  }
}

function skippedRequirements(story: { id: string; summary: string }) {
  console.log("[4/8] Terra skipped because --skip-ai was supplied.");
  return { storyId: story.id, summary: story.summary, acceptanceCriteria: [], designDecisions: [], assumptions: ["AI analysis was skipped."] };
}

function skippedImplementation() {
  console.log("[5/8] Luna comparison skipped because --skip-ai was supplied.");
  return { technicalDesignAdjustments: [] };
}

function skippedSolutionOverview(): undefined {
  console.log("[7/8] Luna overview skipped because --skip-ai was supplied.");
  return undefined;
}

function jiraStoryUrl(ticket: string): string | undefined {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/browse/${encodeURIComponent(ticket)}` : undefined;
}

function startProgressPulse(model: StoryDocModelUsage["stage"], activity: string): () => void {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
    console.log(`[${model}] ${activity} (${elapsedSeconds}s elapsed)...`);
  }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}

function formatUsage(usage: StoryDocModelUsage): string {
  const cost = usage.estimatedApiEquivalentCostUsd === undefined ? "API-equivalent cost unavailable for this model override." : `estimated API-equivalent cost: $${usage.estimatedApiEquivalentCostUsd.toFixed(6)}.`;
  return `[${usage.stage} usage] ${usage.model}: input ${usage.inputTokens.toLocaleString()} (${usage.cachedInputTokens.toLocaleString()} cached), output ${usage.outputTokens.toLocaleString()} (${usage.reasoningOutputTokens.toLocaleString()} reasoning); ${cost}`;
}

function totalEstimatedCost(usage: StoryDocModelUsage[]): number | undefined {
  return usage.every((entry) => entry.estimatedApiEquivalentCostUsd !== undefined) ? usage.reduce((total, entry) => total + (entry.estimatedApiEquivalentCostUsd ?? 0), 0) : undefined;
}

function formatUsageTotal(usage: StoryDocModelUsage[]): string {
  const total = totalEstimatedCost(usage);
  return total === undefined ? "[Cost] API-equivalent total unavailable because at least one overridden model has no configured public rate." : `[Cost] Estimated API-equivalent model cost for this run: $${total.toFixed(6)}. Actual Codex-plan billing may differ.`;
}

function parsePositiveInteger(value: string): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid pull request number: ${value}`); return parsed; }

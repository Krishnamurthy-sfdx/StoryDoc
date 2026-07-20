#!/usr/bin/env node
import { Command } from "commander";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CodexAnalyser } from "./ai/codexAnalyser.js";
import { validateFileEvidence } from "./ai/evidenceValidator.js";
import { buildDocumentationAnalysis } from "./documentation/buildAnalysis.js";
import { renderHtml, renderMarkdown } from "./documentation/render.js";
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

if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) await program.parseAsync(process.argv);

type GenerateOptions = { pr: number; ticket: string; storyFile?: string; designFile?: string; prFile?: string; outputDir: string; force?: boolean; skipAi?: boolean };

async function generate(options: GenerateOptions): Promise<void> {
  const workingDirectory = process.cwd();
  const prProvider = options.prFile ? new LocalPullRequestProvider(resolve(workingDirectory, options.prFile)) : new GitHubCliPullRequestProvider(workingDirectory);
  const storyProvider = options.storyFile ? new LocalFileStoryProvider(resolve(workingDirectory, options.storyFile), options.designFile ? resolve(workingDirectory, options.designFile) : undefined) : new JiraStoryProvider();
  console.log(`Loading pull request #${options.pr}...`);
  const pullRequest = await prProvider.getPullRequest(options.pr);
  const story = await storyProvider.getStory(options.ticket);
  const classifiedFiles = classifyChangedFiles(pullRequest.changedFiles);
  console.log(`Found ${classifiedFiles.length} changed files.`);
  const analyser = new CodexAnalyser(workingDirectory);
  const requirements = options.skipAi ? { storyId: story.id, summary: story.summary, acceptanceCriteria: [], designDecisions: [], assumptions: ["AI analysis was skipped."] } : await analyser.extractRequirements(story);
  const implementation = options.skipAi ? { solutionOverview: "AI analysis was skipped.", components: [], supportingChanges: [], securityChanges: [], dependencies: [], testing: { testFiles: [], sourceScenarios: [], executionStatus: "Tests were not executed by StoryDoc." as const }, deploymentNotes: [], assumptions: [] } : await analyser.analyseImplementation({ story, requirements, pullRequest, classifiedFiles });
  validateFileEvidence(implementation, pullRequest.changedFiles);
  const document = redactSensitiveContent(buildDocumentationAnalysis({ story, requirements, pullRequest, implementation }));
  const outputDirectory = resolveStoryOutputDirectory(workingDirectory, options.outputDir, options.ticket);
  await mkdir(outputDirectory, { recursive: true });
  const outputFiles = [resolve(outputDirectory, "analysis.json"), resolve(outputDirectory, "technical-documentation.md"), resolve(outputDirectory, "technical-documentation.html")];
  if (!options.force) {
    const existingFiles = await Promise.all(outputFiles.map(async (file) => { try { await access(file); return file; } catch { return ""; } }));
    const existing = existingFiles.filter(Boolean);
    if (existing.length > 0) throw new Error(`Output already exists in ${outputDirectory}. Use --force to overwrite existing files.`);
  }
  await Promise.all([
    writeFile(outputFiles[0], `${JSON.stringify(document, null, 2)}\n`, { flag: options.force ? "w" : "wx" }),
    writeFile(outputFiles[1], renderMarkdown(document), { flag: options.force ? "w" : "wx" }),
    writeFile(outputFiles[2], renderHtml(document), { flag: options.force ? "w" : "wx" }),
  ]);
  console.log(`Generated documentation in ${outputDirectory}`);
}

function parsePositiveInteger(value: string): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid pull request number: ${value}`); return parsed; }

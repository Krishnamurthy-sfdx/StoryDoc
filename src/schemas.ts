import { z } from "zod";

export const changedFileSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["added", "modified", "deleted", "renamed", "copied", "changed", "unknown"]),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});

export const pullRequestSchema = z.object({
  number: z.number().int().positive(), title: z.string(), description: z.string(),
  sourceBranch: z.string(), targetBranch: z.string(), status: z.string(),
  changedFiles: z.array(changedFileSchema), diff: z.string(),
});

export const storyContentSchema = z.object({
  id: z.string().min(1), summary: z.string(), description: z.string(),
  acceptanceCriteriaText: z.string(), technicalDesign: z.string(),
});

export const acceptanceCriterionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });
export const designDecisionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

export const requirementsExtractionSchema = z.object({
  storyId: z.string().min(1), summary: z.string(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema),
  designDecisions: z.array(designDecisionSchema), assumptions: z.array(z.string()),
});

/** A pull-request-evidenced change that must be applied to the Jira technical design. */
export const technicalDesignAdjustmentSchema = z.object({
  type: z.enum(["implemented-differently", "removed-by-pr", "added-in-pr"]),
  /** Optional model hint; StoryDoc derives the rendered heading from the exact Jira quotation. */
  sectionHeading: z.string(),
  /** Literal source text from Jira. This is empty only for a material PR-only addition. */
  sourceText: z.string(),
  /** A concise, plain-English description of the evidence-backed implementation change. */
  update: z.string().min(1),
  /** Changed-file paths that support this adjustment; never rendered in the Markdown document. */
  evidencePaths: z.array(z.string().min(1)).min(1),
});

/** Luna returns only targeted updates; it never writes a replacement technical design. */
export const implementationAnalysisSchema = z.object({
  technicalDesignAdjustments: z.array(technicalDesignAdjustmentSchema),
});

/** A short orientation paragraph that appears above, but never replaces, Jira's Technical Design. */
export const solutionOverviewSchema = z.object({
  solutionOverview: z.string().trim().min(1).max(1_600),
});

export const documentationAnalysisSchema = z.object({
  story: z.object({ id: z.string(), summary: z.string(), url: z.string().url().optional() }),
  pullRequest: z.object({ number: z.number().int().positive(), title: z.string(), sourceBranch: z.string(), targetBranch: z.string(), status: z.string() }),
  /** A concise Luna-drafted orientation paragraph, omitted when AI is skipped. */
  solutionOverview: z.string().min(1).optional(),
  /** The Jira Technical Design is the document body and is preserved by the renderer. */
  technicalDesign: z.string(),
  technicalDesignAdjustments: z.array(technicalDesignAdjustmentSchema),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;
export type PullRequestDetails = z.infer<typeof pullRequestSchema>;
export type StoryContent = z.infer<typeof storyContentSchema>;
export type RequirementsExtraction = z.infer<typeof requirementsExtractionSchema>;
export type TechnicalDesignAdjustment = z.infer<typeof technicalDesignAdjustmentSchema>;
export type ImplementationAnalysis = z.infer<typeof implementationAnalysisSchema>;
export type SolutionOverview = z.infer<typeof solutionOverviewSchema>;
export type DocumentationAnalysis = z.infer<typeof documentationAnalysisSchema>;

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

export const componentAnalysisSchema = z.object({
  path: z.string().min(1), component: z.string().min(1), metadataType: z.string().min(1),
  changeType: z.string().min(1), summary: z.string(), implementationDetails: z.array(z.string()),
  relatedAcceptanceCriteria: z.array(z.string()), dependencies: z.array(z.string()),
  securityChanges: z.array(z.string()), testingChanges: z.array(z.string()), deploymentNotes: z.array(z.string()),
});

export const implementationAnalysisSchema = z.object({
  solutionOverview: z.string(), components: z.array(componentAnalysisSchema),
  supportingChanges: z.array(z.string()), securityChanges: z.array(z.string()), dependencies: z.array(z.string()),
  testing: z.object({ testFiles: z.array(z.string()), sourceScenarios: z.array(z.string()), executionStatus: z.literal("Tests were not executed by StoryDoc.") }),
  deploymentNotes: z.array(z.string()), assumptions: z.array(z.string()),
});

export const acceptanceCriterionDocumentationSchema = z.object({
  id: z.string().min(1), criterion: z.string().min(1), implementation: z.string(), components: z.array(z.string()),
  technicalDetails: z.array(z.string()), testing: z.array(z.string()),
});

export const documentationAnalysisSchema = z.object({
  story: z.object({ id: z.string(), summary: z.string(), url: z.string().url().optional() }),
  pullRequest: z.object({ number: z.number().int().positive(), title: z.string(), sourceBranch: z.string(), targetBranch: z.string(), status: z.string() }),
  solutionOverview: z.string(), acceptanceCriteria: z.array(acceptanceCriterionDocumentationSchema),
  components: z.array(componentAnalysisSchema), supportingChanges: z.array(z.string()), securityChanges: z.array(z.string()),
  dependencies: z.array(z.string()),
  testing: z.object({ testFiles: z.array(z.string()), sourceScenarios: z.array(z.string()), executionStatus: z.literal("Tests were not executed by StoryDoc.") }),
  deploymentNotes: z.array(z.string()), assumptions: z.array(z.string()),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;
export type PullRequestDetails = z.infer<typeof pullRequestSchema>;
export type StoryContent = z.infer<typeof storyContentSchema>;
export type RequirementsExtraction = z.infer<typeof requirementsExtractionSchema>;
export type ComponentAnalysis = z.infer<typeof componentAnalysisSchema>;
export type ImplementationAnalysis = z.infer<typeof implementationAnalysisSchema>;
export type DocumentationAnalysis = z.infer<typeof documentationAnalysisSchema>;

import type { DocumentationAnalysis, ImplementationAnalysis, PullRequestDetails, StoryContent } from "../schemas.js";
import { findTechnicalDesignSectionHeading } from "../technicalDesignEvidence.js";

/**
 * Builds a renderer-friendly document without asking an AI model to recreate Jira's
 * technical design. The Jira field remains the document body; Luna contributes only
 * PR-evidenced updates that change or extend that source material.
 */
export function buildDocumentationAnalysis(input: { story: StoryContent; storyUrl?: string; pullRequest: PullRequestDetails; implementation: ImplementationAnalysis; solutionOverview?: string }): DocumentationAnalysis {
  const solutionOverview = input.solutionOverview?.trim();
  return {
    story: {
      id: input.story.id,
      summary: input.story.summary,
      ...(input.storyUrl ? { url: input.storyUrl } : {}),
    },
    pullRequest: {
      number: input.pullRequest.number,
      title: input.pullRequest.title,
      sourceBranch: input.pullRequest.sourceBranch,
      targetBranch: input.pullRequest.targetBranch,
      status: input.pullRequest.status,
    },
    ...(solutionOverview ? { solutionOverview } : {}),
    technicalDesign: input.story.technicalDesign,
    technicalDesignAdjustments: input.implementation.technicalDesignAdjustments.map((adjustment) => ({
      ...adjustment,
      // Never render a model-invented section label. Derive the display heading from
      // the preserved Jira source that contains the exact quoted statement instead.
      sectionHeading: findTechnicalDesignSectionHeading(input.story.technicalDesign, adjustment.sourceText),
    })),
  };
}

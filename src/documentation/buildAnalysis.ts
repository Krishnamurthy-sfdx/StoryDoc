import type { DocumentationAnalysis, ImplementationAnalysis, PullRequestDetails, RequirementsExtraction, StoryContent } from "../schemas.js";

export function buildDocumentationAnalysis(input: { story: StoryContent; requirements: RequirementsExtraction; pullRequest: PullRequestDetails; implementation: ImplementationAnalysis }): DocumentationAnalysis {
  const componentsByAc = new Map<string, typeof input.implementation.components>();
  for (const component of input.implementation.components) for (const id of component.relatedAcceptanceCriteria) componentsByAc.set(id, [...(componentsByAc.get(id) ?? []), component]);
  return {
    story: { id: input.story.id, summary: input.requirements.summary || input.story.summary },
    pullRequest: { number: input.pullRequest.number, title: input.pullRequest.title, sourceBranch: input.pullRequest.sourceBranch, targetBranch: input.pullRequest.targetBranch, status: input.pullRequest.status },
    solutionOverview: input.implementation.solutionOverview,
    acceptanceCriteria: input.requirements.acceptanceCriteria.map((criterion) => {
      const components = componentsByAc.get(criterion.id) ?? [];
      return { id: criterion.id, criterion: criterion.text, implementation: components.length ? components.map((component) => component.summary).join(" ") : "The implementation analysis did not associate a changed component with this criterion.", components: components.map((component) => component.path), technicalDetails: components.flatMap((component) => component.implementationDetails), testing: components.flatMap((component) => component.testingChanges) };
    }),
    components: input.implementation.components, supportingChanges: input.implementation.supportingChanges, securityChanges: input.implementation.securityChanges,
    dependencies: input.implementation.dependencies, testing: input.implementation.testing, deploymentNotes: input.implementation.deploymentNotes,
    assumptions: [...input.requirements.assumptions, ...input.implementation.assumptions],
  };
}

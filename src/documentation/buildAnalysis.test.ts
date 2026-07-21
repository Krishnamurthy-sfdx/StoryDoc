import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentationAnalysis } from "./buildAnalysis.js";

test("builds the compact analysis document without repeating requirements", () => {
  const document = buildDocumentationAnalysis({
    story: { id: "SCRUM-1", summary: "Manage subscriptions", description: "", acceptanceCriteriaText: "", technicalDesign: "" },
    requirements: { storyId: "SCRUM-1", summary: "Manage subscriptions", acceptanceCriteria: [{ id: "AC-1", text: "Create subscriptions." }], designDecisions: [], assumptions: [] },
    pullRequest: { number: 1, title: "SCRUM-1: subscription lifecycle", description: "", sourceBranch: "feature/story-001", targetBranch: "main", status: "OPEN", changedFiles: [], diff: "" },
    implementation: {
      solutionOverview: "A subscription is created from a Closed Won Opportunity.",
      components: [{ path: "force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml", component: "Subscription__c", metadataType: "Custom Object", changeType: "added", summary: "Stores subscription records.", implementationDetails: ["Stores the subscription lifecycle values."], relatedAcceptanceCriteria: ["AC-1"], dependencies: [], securityChanges: [], testingChanges: [], deploymentNotes: [] }],
      supportingChanges: [], securityChanges: [], dependencies: [], testing: { testFiles: [], sourceScenarios: [], executionStatus: "Tests were not executed by StoryDoc." }, deploymentNotes: [], assumptions: [],
    },
  });
  assert.equal(document.acceptanceCriteria.length, 1);
  assert.equal(document.components.length, 1);
  assert.match(document.acceptanceCriteria[0]?.implementation ?? "", /Stores subscription records/);
});

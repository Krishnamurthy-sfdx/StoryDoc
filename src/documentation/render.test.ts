import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentationAnalysis } from "../schemas.js";
import { renderMarkdown } from "./render.js";

test("renders a concise Confluence-ready technical design", () => {
  const document: DocumentationAnalysis = {
    story: { id: "APP-142", summary: "Eligibility" },
    pullRequest: { number: 142, title: "Eligibility", sourceBranch: "feature/eligibility", targetBranch: "main", status: "OPEN" },
    solutionOverview: "The service validates `Eligibility__c` records before processing.",
    acceptanceCriteria: [],
    components: [{ path: "force-app/main/default/classes/Eligibility.cls", component: "Eligibility", metadataType: "ApexClass", changeType: "modified", summary: "Validates eligibility records.", implementationDetails: ["The class validates required values before the record is processed."], relatedAcceptanceCriteria: [], dependencies: [], securityChanges: [], testingChanges: [], deploymentNotes: [] }],
    supportingChanges: ["The caller invokes the service before saving the record."],
    securityChanges: [], dependencies: [],
    testing: { testFiles: ["EligibilityTest.cls"], sourceScenarios: ["Reject an incomplete record."], executionStatus: "Tests were not executed by StoryDoc." },
    deploymentNotes: ["Deploy the Apex class and assign access."], assumptions: [],
  };
  const markdown = renderMarkdown(document);
  assert.match(markdown, /## Story Overview/);
  assert.match(markdown, /## Solution Overview/);
  assert.match(markdown, /## Technical Implementation/);
  assert.match(markdown, /`Eligibility__c`/);
  assert.doesNotMatch(markdown, /Acceptance Criteria|Components Changed|Component Appendix|Contradictions and Decisions|None identified\./);
  assert.doesNotMatch(markdown, /force-app\/main\/default/);
});

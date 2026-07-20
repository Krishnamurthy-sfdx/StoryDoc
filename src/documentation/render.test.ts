import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentationAnalysis } from "../schemas.js";
import { renderHtml } from "./render.js";

test("renders escaped structured HTML without list elements inside paragraphs", () => {
  const document: DocumentationAnalysis = {
    story: { id: "APP-142", summary: "<script>alert(1)</script>" },
    pullRequest: { number: 142, title: "Eligibility", sourceBranch: "feature/eligibility", targetBranch: "main", status: "OPEN" },
    solutionOverview: "Validate eligibility.",
    acceptanceCriteria: [{ id: "AC-1", criterion: "Validate", implementation: "Implemented safely.", components: ["Eligibility.cls"], technicalDetails: ["Service layer"], testing: ["EligibilityTest.cls"] }],
    components: [], supportingChanges: [], securityChanges: [], dependencies: [],
    testing: { testFiles: [], sourceScenarios: [], executionStatus: "Tests were not executed by StoryDoc." },
    deploymentNotes: [], assumptions: [],
  };
  const html = renderHtml(document);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /<ul><li>/);
  assert.doesNotMatch(html, /<p>[^<]*<li>/);
});

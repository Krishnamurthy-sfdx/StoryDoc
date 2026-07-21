import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentationAnalysis } from "./buildAnalysis.js";

test("uses Jira's technical design as the document body and carries only PR updates", () => {
  const technicalDesign = "## Error Handling\n\nCreate a Task for failures.";
  const document = buildDocumentationAnalysis({
    story: { id: "SCRUM-1", summary: "Manage subscriptions", description: "", acceptanceCriteriaText: "", technicalDesign },
    pullRequest: { number: 1, title: "SCRUM-1: subscription lifecycle", description: "", sourceBranch: "feature/story-001", targetBranch: "main", status: "OPEN", changedFiles: [], diff: "" },
    solutionOverview: "Subscriptions are created when an opportunity is won.",
    implementation: {
      technicalDesignAdjustments: [{
        type: "implemented-differently",
        sectionHeading: "A shortened model label",
        sourceText: "Create a Task for failures.",
        update: "The pull request creates an Error_Log__c record instead of a Task.",
        evidencePaths: ["force-app/main/default/flows/Create_Subscription.flow-meta.xml"],
      }],
    },
  });

  assert.equal(document.story.summary, "Manage subscriptions");
  assert.equal(document.solutionOverview, "Subscriptions are created when an opportunity is won.");
  assert.equal(document.technicalDesign, technicalDesign);
  assert.equal(document.technicalDesignAdjustments.length, 1);
  assert.equal(document.technicalDesignAdjustments[0]?.sourceText, "Create a Task for failures.");
  assert.equal(document.technicalDesignAdjustments[0]?.sectionHeading, "Error Handling");
  assert.equal("acceptanceCriteria" in document, false);
  assert.equal("components" in document, false);
});

test("derives the Jira heading when a validated quotation differs only in Markdown decoration", () => {
  const document = buildDocumentationAnalysis({
    story: {
      id: "SCRUM-1",
      summary: "Manage subscriptions",
      description: "",
      acceptanceCriteriaText: "",
      technicalDesign: "## Renewal automation\n\n- **Fault Path**: Create an `Error_Log__c` record.",
    },
    pullRequest: { number: 1, title: "Subscription lifecycle", description: "", sourceBranch: "feature/story-001", targetBranch: "main", status: "OPEN", changedFiles: [], diff: "" },
    implementation: {
      technicalDesignAdjustments: [{
        type: "implemented-differently",
        sectionHeading: "",
        sourceText: "Fault Path: Create an Error_Log__c record.",
        update: "The PR records the failure differently.",
        evidencePaths: ["force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml"],
      }],
    },
  });

  assert.equal(document.technicalDesignAdjustments[0]?.sectionHeading, "Renewal automation");
});

import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentationAnalysis } from "../schemas.js";
import { renderMarkdown } from "./render.js";

test("preserves the Jira technical design and adds only PR-evidenced updates", () => {
  const technicalDesign = [
    "# Eligibility design",
    "",
    "The flow creates Eligibility__c records before submission.",
    "",
    "## Error handling",
    "",
    "Create a Task for failures.",
    "",
    "```apex",
    "public class EligibilityService {}",
    "```",
  ].join("\n");
  const document: DocumentationAnalysis = {
    story: { id: "APP-142", summary: "Eligibility" },
    pullRequest: { number: 142, title: "Eligibility", sourceBranch: "feature/eligibility", targetBranch: "main", status: "OPEN" },
    solutionOverview: "The solution creates `Eligibility__c` records and records failures for follow-up.",
    technicalDesign,
    technicalDesignAdjustments: [{
      type: "implemented-differently",
      sectionHeading: "Error handling",
      sourceText: "Create a Task for failures.",
      update: "The pull request creates an Error_Log__c record instead of a Task.",
      evidencePaths: ["force-app/main/default/flows/Validate_Eligibility.flow-meta.xml"],
    }],
  };

  const markdown = renderMarkdown(document);

  assert.match(markdown, /### Story Overview/);
  assert.match(markdown, /### Solution Overview/);
  assert.match(markdown, /The solution creates `Eligibility__c` records and records failures for follow-up\./);
  assert.match(markdown, /### Technical Design/);
  assert.ok(markdown.indexOf("### Solution Overview") < markdown.indexOf("### Technical Design"));
  assert.match(markdown, /#### Eligibility design/);
  assert.match(markdown, /#### Error handling/);
  assert.match(markdown, /The flow creates `Eligibility__c` records before submission\./);
  assert.match(markdown, /Create a Task for failures\./);
  assert.match(markdown, /```apex\npublic class EligibilityService \{\}\n```/);
  assert.match(markdown, /### Pull Request Updates to the Technical Design/);
  assert.match(markdown, /The pull request creates an `Error_Log__c` record instead of a Task\./);
  assert.match(markdown, /\| Implemented differently \| Create a Task for failures\. \|/);
  assert.doesNotMatch(markdown, /^##(?!#)/m);
  assert.equal((markdown.match(/^#(?!#)/gm) ?? []).length, 1);
  assert.doesNotMatch(markdown, /Technical Implementation|Testing|Acceptance Criteria|Components Changed|Component Appendix|Contradictions and Decisions|None identified\.|[📚📌🌐🧩🔧🔒🔗🧪🚀🧠]/);
  assert.doesNotMatch(markdown, /force-app\/main\/default/);
});

test("omits the PR update section when the pull request matches Jira's technical design", () => {
  const markdown = renderMarkdown({
    story: { id: "APP-143", summary: "Matching implementation" },
    pullRequest: { number: 143, title: "Matching implementation", sourceBranch: "feature/match", targetBranch: "main", status: "OPEN" },
    technicalDesign: "Use Subscription__c for customer subscriptions.",
    technicalDesignAdjustments: [],
  });
  assert.match(markdown, /Use `Subscription__c` for customer subscriptions\./);
  assert.doesNotMatch(markdown, /### Solution Overview/);
  assert.doesNotMatch(markdown, /Pull Request Updates to the Technical Design/);
});

test("keeps Jira tables intact and does not code-format prose labels ending in Name", () => {
  const markdown = renderMarkdown({
    story: { id: "SCRUM-1", summary: "Subscription fields" },
    pullRequest: { number: 1, title: "Subscription fields", sourceBranch: "feature/subscriptions", targetBranch: "main", status: "OPEN" },
    technicalDesign: [
      "| Field Label | API Name | Type | Details |",
      "| --- | --- | --- | --- |",
      "| Start Date | `Start_Date__c` | Date | Required. |",
      "",
      "**Record Name**: Auto-number",
    ].join("\n"),
    technicalDesignAdjustments: [],
  });

  assert.match(markdown, /\| Field Label \| API Name \| Type \| Details \|/);
  assert.match(markdown, /\| Start Date \| `Start_Date__c` \| Date \| Required\. \|/);
  assert.match(markdown, /\*\*Record Name\*\*: Auto-number/);
  assert.doesNotMatch(markdown, /API `Name`|Record `Name`/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { validateFileEvidence } from "./evidenceValidator.js";

const changedFiles = [{ path: "force-app/main/default/classes/Eligibility.cls", status: "modified" as const }];
const technicalDesign = "## Error handling\nUse EligibilityService to create a Task for failures.";

test("accepts a PR update with changed-file and Jira-source evidence", () => {
  assert.doesNotThrow(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "implemented-differently",
    sectionHeading: "Shortened error-handling label",
    sourceText: "create a Task for failures.",
    update: "The pull request creates an Error_Log__c record instead of a Task.",
    evidencePaths: [changedFiles[0].path],
  }] }, changedFiles, technicalDesign));
});

test("rejects PR evidence outside the pull request", () => {
  assert.throws(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "added-in-pr",
    sectionHeading: "",
    sourceText: "",
    update: "Adds an implementation change.",
    evidencePaths: ["../../.env"],
  }] }, changedFiles, technicalDesign), /not in the pull request/);
});

test("rejects a Jira reference that was not supplied", () => {
  assert.throws(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "removed-by-pr",
    sectionHeading: "",
    sourceText: "Invented design statement.",
    update: "The pull request removes it.",
    evidencePaths: [changedFiles[0].path],
  }] }, changedFiles, technicalDesign), /Jira Technical Design text that was not supplied/);
});

test("does not treat a model heading hint as Jira evidence", () => {
  assert.doesNotThrow(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "implemented-differently",
    sectionHeading: "Invented section",
    sourceText: "create a Task for failures.",
    update: "The pull request changes it.",
    evidencePaths: [changedFiles[0].path],
  }] }, changedFiles, technicalDesign));
});

test("accepts a literal Jira quotation when only Markdown decoration and whitespace differ", () => {
  const formattedTechnicalDesign = "### Renewal automation\n\n3. **Create Additional Task for Renewal Contact** (if `Renewal_Contact__c` is populated):\n  - Same as above but `WhoId` = `Renewal_Contact__c`";
  assert.doesNotThrow(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "implemented-differently",
    sectionHeading: "",
    sourceText: "3. Create Additional Task for Renewal Contact (if Renewal_Contact__c is populated):\nSame as above but WhoId = Renewal_Contact__c",
    update: "The PR uses a single task instead.",
    evidencePaths: [changedFiles[0].path],
  }] }, changedFiles, formattedTechnicalDesign));
});

test("requires PR-only additions to leave Jira references empty", () => {
  assert.throws(() => validateFileEvidence({ technicalDesignAdjustments: [{
    type: "added-in-pr",
    sectionHeading: "Feature",
    sourceText: "A Jira statement.",
    update: "Adds a feature.",
    evidencePaths: [changedFiles[0].path],
  }] }, changedFiles, technicalDesign), /leave sourceText empty/);
});

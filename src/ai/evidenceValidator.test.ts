import test from "node:test";
import assert from "node:assert/strict";
import { validateFileEvidence } from "./evidenceValidator.js";

const changedFiles = [{ path: "force-app/main/default/classes/Eligibility.cls", status: "modified" as const }];

test("accepts component evidence from the pull request", () => {
  assert.doesNotThrow(() => validateFileEvidence({ components: [{
    path: changedFiles[0].path,
    component: "Eligibility",
    metadataType: "ApexClass",
    changeType: "modified",
    summary: "Validates eligibility.",
    implementationDetails: ["The class validates submitted records before processing."],
    relatedAcceptanceCriteria: [], dependencies: [], securityChanges: [], testingChanges: [], deploymentNotes: [],
  }] }, changedFiles));
});

test("rejects component evidence outside the pull request", () => {
  assert.throws(() => validateFileEvidence({ components: [{
    path: "../../.env",
    component: "Unknown",
    metadataType: "OtherSalesforceMetadata",
    changeType: "changed",
    summary: "Unexpected file.", implementationDetails: ["This component is not part of the pull request."],
    relatedAcceptanceCriteria: [], dependencies: [], securityChanges: [], testingChanges: [], deploymentNotes: [],
  }] }, changedFiles), /not in the pull request/);
});

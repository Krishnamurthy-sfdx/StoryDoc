import test from "node:test";
import assert from "node:assert/strict";
import { classifySalesforceFile } from "./metadataClassifier.js";

test("classifies Apex metadata sidecars", () => {
  assert.deepEqual(classifySalesforceFile({ path: "force-app/main/default/classes/EligibilityService.cls-meta.xml", status: "modified" }), { path: "force-app/main/default/classes/EligibilityService.cls-meta.xml", component: "EligibilityService", metadataType: "ApexClass", changeType: "modified" });
});
test("groups LWC files by folder", () => { assert.equal(classifySalesforceFile({ path: "force-app/main/default/lwc/applicationSubmission/applicationSubmission.js", status: "added" }).component, "applicationSubmission"); });
test("strips Salesforce metadata suffixes from permission sets", () => { assert.equal(classifySalesforceFile({ path: "force-app/main/default/permissionsets/Application_User.permissionset-meta.xml", status: "modified" }).component, "Application_User"); });

import test from "node:test";
import assert from "node:assert/strict";
import { classifySalesforceFile } from "./metadataClassifier.js";

test("classifies Apex metadata sidecars", () => {
  assert.deepEqual(classifySalesforceFile({ path: "force-app/main/default/classes/EligibilityService.cls-meta.xml", status: "modified" }), { path: "force-app/main/default/classes/EligibilityService.cls-meta.xml", component: "EligibilityService", metadataType: "ApexClass", changeType: "modified" });
});
test("groups LWC files by folder", () => { assert.equal(classifySalesforceFile({ path: "force-app/main/default/lwc/applicationSubmission/applicationSubmission.js", status: "added" }).component, "applicationSubmission"); });
test("strips Salesforce metadata suffixes from permission sets", () => { assert.equal(classifySalesforceFile({ path: "force-app/main/default/permissionsets/Application_User.permissionset-meta.xml", status: "modified" }).component, "Application_User"); });
test("names Salesforce objects and fields without repository paths", () => {
  assert.deepEqual(classifySalesforceFile({ path: "force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml", status: "added" }), { path: "force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml", component: "Subscription__c", metadataType: "Custom Object", changeType: "added" });
  assert.deepEqual(classifySalesforceFile({ path: "force-app/main/default/objects/Subscription__c/fields/End_Date__c.field-meta.xml", status: "added" }), { path: "force-app/main/default/objects/Subscription__c/fields/End_Date__c.field-meta.xml", component: "Subscription__c.End_Date__c", metadataType: "Custom Field", changeType: "added" });
});

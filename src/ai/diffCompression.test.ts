import test from "node:test";
import assert from "node:assert/strict";
import { compressPullRequestInput, extractDiffHunks, filterSalesforceNoise } from "./diffCompression.js";

test("filters Salesforce metadata and translation noise", () => {
  const files = [
    { path: "force-app/main/default/classes/Account.cls" },
    { path: "force-app/main/default/classes/Account.cls-meta.xml" },
    { path: "force-app/main/default/profiles/Admin.profile-meta.xml" },
    { path: "force-app/main/default/permissionsets/User.permissionset-meta.xml" },
    { path: "force-app/main/default/translations/en_US.translation-meta.xml" },
    { path: "package-lock.json" },
    { path: "force-app/main/default/lwc/accountView/accountView.js" },
  ];
  assert.deepEqual(filterSalesforceNoise(files), [files[0], files[6]]);
});

test("keeps file headers, hunks, changes, and at most two context lines around changes", () => {
  const diff = [
    "diff --git a/classes/AccountController.cls b/classes/AccountController.cls",
    "--- a/classes/AccountController.cls",
    "+++ b/classes/AccountController.cls",
    "@@ -1500,12 +1500,12 @@",
    " unchanged context line 1",
    " unchanged context line 2",
    " unchanged context line 3",
    " unchanged context line 4",
    "- public static void flagHighRiskAccount(Id accId) {",
    "- Account acc = [SELECT Id FROM Account WHERE Id = :accId];",
    "+ public static void flagHighRiskAccount(Id accId) {",
    "+ Account acc = [SELECT Id FROM Account WHERE Id = :accId WITH SECURITY_ENFORCED];",
    " unchanged context line 5",
    " unchanged context line 6",
    " unchanged context line 7",
    " unchanged context line 8",
    "diff --git a/classes/Other.cls b/classes/Other.cls",
    "@@ -10,4 +10,4 @@",
    " old context 1",
    " old context 2",
    "-oldValue",
    "+newValue",
    " new context 1",
    " new context 2",
  ].join("\n");

  const compressed = extractDiffHunks(diff);
  assert.equal(compressed, [
    "diff --git a/classes/AccountController.cls b/classes/AccountController.cls",
    "@@ -1500,12 +1500,12 @@",
    " unchanged context line 3",
    " unchanged context line 4",
    "- public static void flagHighRiskAccount(Id accId) {",
    "- Account acc = [SELECT Id FROM Account WHERE Id = :accId];",
    "+ public static void flagHighRiskAccount(Id accId) {",
    "+ Account acc = [SELECT Id FROM Account WHERE Id = :accId WITH SECURITY_ENFORCED];",
    " unchanged context line 5",
    " unchanged context line 6",
    "diff --git a/classes/Other.cls b/classes/Other.cls",
    "@@ -10,4 +10,4 @@",
    " old context 1",
    " old context 2",
    "-oldValue",
    "+newValue",
    " new context 1",
    " new context 2",
  ].join("\n"));
});

test("returns original and compressed values for an audit report", () => {
  const files = [{ path: "classes/Account.cls" }, { path: "package-lock.json" }];
  const diff = "diff --git a/classes/Account.cls b/classes/Account.cls\n@@ -1,1 +1,1 @@\n-old\n+new";
  assert.deepEqual(compressPullRequestInput(files, diff), {
    originalFiles: files,
    filteredFiles: [files[0]],
    originalDiff: diff,
    compressedDiff: diff,
  });
});

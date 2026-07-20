import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  /\bATATT[A-Za-z0-9_=-]{20,}\b/,
  /\b(?:ghp_|github_pat_|xoxb-|xoxp-|sk-)[A-Za-z0-9_-]{12,}\b/,
  /-----BEGIN [^-\n]*(?:PRIVATE KEY|CERTIFICATE)-----/,
  /(?:JIRA_API_TOKEN|JIRA_BEARER_TOKEN|API[_-]?KEY|CLIENT[_-]?SECRET|PASSWORD)[ \t]*=[ \t]*[^\s#][^\n]{7,}/i,
];
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const matches = [];
for (const file of trackedFiles) {
  const content = readFileSync(file, "utf8");
  if (patterns.some((pattern) => pattern.test(content))) matches.push(file);
}
if (matches.length > 0) {
  console.error(`Potential secret detected in tracked file(s): ${matches.join(", ")}`);
  process.exit(1);
}
console.log("Secret scan passed for tracked files.");

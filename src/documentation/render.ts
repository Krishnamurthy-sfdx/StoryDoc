import type { ComponentAnalysis, DocumentationAnalysis } from "../schemas.js";

export function renderMarkdown(document: DocumentationAnalysis): string {
  const lines = [
    `# ${document.story.id} — ${formatSalesforceNames(document.story.summary || "Salesforce Technical Design Document")}`,
    "",
    ...(document.story.url ? [`[Open Jira story](${document.story.url})`, ""] : []),
    "## Story Overview",
    "",
    markdownTable(["Item", "Details"], [
      ["Jira story", document.story.id],
      ["Pull request", `#${document.pullRequest.number} — ${document.pullRequest.title}`],
      ["Source branch", document.pullRequest.sourceBranch],
      ["Target branch", document.pullRequest.targetBranch],
      ["Pull request status", document.pullRequest.status],
    ]),
    "",
    "## Solution Overview",
    "",
    formatSalesforceNames(document.solutionOverview || "No solution overview was supplied."),
    "",
  ];

  const components = mergeComponents(document.components);
  if (components.length) {
    lines.push("## Technical Implementation", "", "The following implementation areas explain how the Salesforce solution is built.", "");
    for (const component of components) {
      lines.push(`### ${formatSalesforceNames(component.component)}`, "", `**Salesforce type:** ${component.metadataType}`, `**Change:** ${component.changeType}`, "", formatSalesforceNames(component.summary));
      if (component.implementationDetails.length) lines.push("", "**Implementation details**", "", bulletList(component.implementationDetails));
      lines.push("");
    }
  }

  addListSection(lines, "## Supporting Changes", document.supportingChanges);
  addListSection(lines, "## Security and Access", document.securityChanges);
  addListSection(lines, "## Dependencies", document.dependencies);

  if (document.testing.testFiles.length || document.testing.sourceScenarios.length || document.testing.executionStatus) {
    lines.push("## Testing", "");
    if (document.testing.testFiles.length) lines.push("**Test files**", "", bulletList(document.testing.testFiles), "");
    if (document.testing.sourceScenarios.length) lines.push("**Scenarios to verify**", "", bulletList(document.testing.sourceScenarios), "");
    lines.push(`Test execution status: ${document.testing.executionStatus}`, "");
  }

  addListSection(lines, "## Deployment Notes", document.deploymentNotes);
  addListSection(lines, "## Technical Assumptions", document.assumptions);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function mergeComponents(components: ComponentAnalysis[]): ComponentAnalysis[] {
  const merged = new Map<string, ComponentAnalysis>();
  for (const component of components) {
    const key = `${component.component}|${component.metadataType}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...component, implementationDetails: unique(component.implementationDetails), testingChanges: unique(component.testingChanges) });
      continue;
    }
    merged.set(key, {
      ...existing,
      summary: existing.summary || component.summary,
      implementationDetails: unique([...existing.implementationDetails, ...component.implementationDetails]),
      dependencies: unique([...existing.dependencies, ...component.dependencies]),
      securityChanges: unique([...existing.securityChanges, ...component.securityChanges]),
      testingChanges: unique([...existing.testingChanges, ...component.testingChanges]),
      deploymentNotes: unique([...existing.deploymentNotes, ...component.deploymentNotes]),
    });
  }
  return [...merged.values()];
}

function addListSection(lines: string[], title: string, values: string[]): void {
  if (!values.length) return;
  lines.push(title, "", bulletList(values), "");
}

function bulletList(values: string[]): string { return values.map((value) => `- ${formatSalesforceNames(value)}`).join("\n"); }

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((_header, index) => markdownCell(row[index] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value: string): string { return formatSalesforceNames(value).replaceAll("|", "\\|").replaceAll("\n", "<br>"); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

function formatSalesforceNames(value: string): string {
  const placeholders: string[] = [];
  const protectedValue = value.replace(/`[^`]+`/g, (match) => {
    placeholders.push(match);
    return `\u0000${placeholders.length - 1}\u0000`;
  });
  const customNames = /\b(?:[A-Za-z][A-Za-z0-9]*\.)?[A-Za-z][A-Za-z0-9]*__(?:c|r)(?:\.[A-Za-z][A-Za-z0-9]*__(?:c|r))?\b/g;
  const standardFields = /\b(?:AccountId|Amount|CloseDate|CreatedDate|LastModifiedDate|Name|OwnerId|StageName|WhoId|WhatId)\b/g;
  const formatted = protectedValue.replace(customNames, (match) => `\`${match}\``).replace(standardFields, (match) => `\`${match}\``);
  return formatted.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => placeholders[Number(index)] ?? "");
}

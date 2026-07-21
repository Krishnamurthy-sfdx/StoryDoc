import type { DocumentationAnalysis, TechnicalDesignAdjustment } from "../schemas.js";

/**
 * Renders Jira's Technical Design as the document body. The renderer intentionally
 * does not use Luna to create an alternative design; it adds only PR-evidenced
 * updates after the preserved Jira source.
 */
export function renderMarkdown(document: DocumentationAnalysis): string {
  const hasTechnicalDesign = Boolean(document.technicalDesign.trim());
  const hasAdjustments = document.technicalDesignAdjustments.length > 0;
  const solutionOverview = document.solutionOverview?.trim();
  const lines = [
    `# ${document.story.id} — ${formatSalesforceNames(document.story.summary || "Salesforce Technical Design Document")}`,
    "",
    ...(document.story.url ? [`[Open Jira story](${document.story.url})`, ""] : []),
    "### Contents",
    "",
    "- [Story Overview](#story-overview)",
    ...(solutionOverview ? ["- [Solution Overview](#solution-overview)"] : []),
    ...(hasTechnicalDesign ? ["- [Technical Design](#technical-design)"] : []),
    ...(hasAdjustments ? ["- [Pull Request Updates to the Technical Design](#pull-request-updates-to-the-technical-design)"] : []),
    "",
    "### Story Overview",
    "",
    markdownTable(["Item", "Details"], [
      ["Jira story", inlineCode(document.story.id)],
      ["Pull request", `${inlineCode(`#${document.pullRequest.number}`)} — ${formatSalesforceNames(document.pullRequest.title)}`],
      ["Source branch", inlineCode(document.pullRequest.sourceBranch)],
      ["Target branch", inlineCode(document.pullRequest.targetBranch)],
      ["Pull request status", formatSalesforceNames(document.pullRequest.status)],
    ]),
    "",
  ];

  if (solutionOverview) appendSolutionOverview(lines, solutionOverview);
  if (hasTechnicalDesign) appendJiraTechnicalDesign(lines, document.technicalDesign);
  if (hasAdjustments) appendTechnicalDesignAdjustments(lines, document.technicalDesignAdjustments);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function appendSolutionOverview(lines: string[], solutionOverview: string): void {
  lines.push(
    "### Solution Overview",
    "",
    formatSalesforceNames(solutionOverview),
    "",
  );
}

function appendJiraTechnicalDesign(lines: string[], technicalDesign: string): void {
  lines.push(
    "### Technical Design",
    "",
    "The following content is preserved from the Jira Technical Design. Pull-request differences, if any, are listed separately.",
    "",
    formatJiraTechnicalDesign(technicalDesign),
    "",
  );
}

function appendTechnicalDesignAdjustments(lines: string[], adjustments: TechnicalDesignAdjustment[]): void {
  const uniqueAdjustments = uniqueAdjustmentsByContent(adjustments);
  lines.push(
    "### Pull Request Updates to the Technical Design",
    "",
    "These are the only changes StoryDoc recommends applying to the preserved Jira Technical Design. Each update is supported by the supplied pull request.",
    "",
  );

  for (const adjustment of uniqueAdjustments) {
    const title = adjustment.sectionHeading.trim()
      ? `#### ${formatSalesforceNames(adjustment.sectionHeading.trim())}`
      : "#### Additional implementation in the pull request";
    const jiraReference = adjustment.sourceText.trim()
      ? formatSalesforceNames(adjustment.sourceText.trim())
      : "This material implementation change is not described in the Jira Technical Design.";
    lines.push(
      title,
      "",
      markdownTable(["Update type", "Jira Technical Design reference", "Pull request update"], [[
        adjustmentLabel(adjustment.type),
        jiraReference,
        formatSalesforceNames(adjustment.update),
      ]]),
      "",
    );
  }
}

/**
 * Keep Jira's wording and sequence intact. Only normalize heading levels for the
 * document style and add inline code formatting to Salesforce API names.
 */
function formatJiraTechnicalDesign(value: string): string {
  let inCodeFence = false;
  return value.replaceAll("\r\n", "\n").split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      return line;
    }
    if (inCodeFence) return line;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) return `#### ${formatSalesforceNames(heading[1])}`;
    return formatSalesforceNames(line);
  }).join("\n").trim();
}

function adjustmentLabel(type: TechnicalDesignAdjustment["type"]): string {
  switch (type) {
    case "implemented-differently": return "Implemented differently";
    case "removed-by-pr": return "Removed or changed by the pull request";
    case "added-in-pr": return "Added in the pull request";
  }
}

function uniqueAdjustmentsByContent(adjustments: TechnicalDesignAdjustment[]): TechnicalDesignAdjustment[] {
  const seen = new Set<string>();
  return adjustments.filter((adjustment) => {
    const key = `${adjustment.type}\u0000${adjustment.sectionHeading}\u0000${adjustment.sourceText}\u0000${adjustment.update}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((_header, index) => markdownCell(row[index] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll("`", "\\`")}\``;
}

function formatSalesforceNames(value: string): string {
  const placeholders: string[] = [];
  const protectedValue = value.replace(/`[^`]+`/g, (match) => {
    placeholders.push(match);
    return `\u0000${placeholders.length - 1}\u0000`;
  });
  const customNames = /\b(?:[A-Za-z][A-Za-z0-9_]*\.)?[A-Za-z][A-Za-z0-9_]*__(?:c|r)(?:\.[A-Za-z][A-Za-z0-9_]*__(?:c|r))?\b/g;
  const standardFields = /\b(?:AccountId|Amount|CloseDate|CreatedDate|LastModifiedDate|OwnerId|StageName|WhoId|WhatId)\b/g;
  const formatted = protectedValue
    .replace(customNames, (match) => inlineCode(match))
    .replace(standardFields, (match) => inlineCode(match));
  return formatted.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => placeholders[Number(index)] ?? "");
}

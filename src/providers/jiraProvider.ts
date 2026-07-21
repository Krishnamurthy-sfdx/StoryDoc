import { z } from "zod";
import type { StoryContent } from "../schemas.js";
import type { StoryProvider } from "./storyProvider.js";

const jiraIssueResponseSchema = z.object({ fields: z.record(z.unknown()) });
const defaultRequestTimeoutMs = 15_000;
type ProgressReporter = (message: string) => void;

export type JiraStoryProviderOptions = {
  baseUrl: string;
  acceptanceCriteriaField: string;
  technicalDesignField: string;
  bearerToken?: string;
  email?: string;
  apiToken?: string;
  cloudId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Jira adapter intentionally asks for the built-in summary and two configured custom fields.
 * Custom field IDs are configurable because they differ by Jira instance.
 */
export class JiraStoryProvider implements StoryProvider {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: JiraStoryProviderOptions = fromEnvironment(), private readonly reportProgress?: ProgressReporter) {
    validateJiraBaseUrl(options.baseUrl);
    validateJiraAuthentication(options);
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error("JIRA request timeout must be a positive integer.");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async getStory(reference: string): Promise<StoryContent> {
    const fields = ["summary", this.options.acceptanceCriteriaField, this.options.technicalDesignField];
    const url = this.issueUrl(reference);
    url.searchParams.set("fields", fields.join(","));
    const source = this.options.cloudId ? "Atlassian API gateway" : "Jira site API";
    this.reportProgress?.(`[2/8] ${source}: fetching ${reference}; fields: summary, ${this.options.acceptanceCriteriaField} (Acceptance Criteria), ${this.options.technicalDesignField} (Technical Design).`);
    const headers = this.headers();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? defaultRequestTimeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Jira request timed out while loading ${reference}.`);
      throw new Error(`Unable to load Jira story ${reference}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Jira returned HTTP ${response.status} while loading ${reference}.`);
    this.reportProgress?.(`[2/8] Jira API: response received for ${reference}; parsing the requested fields.`);
    let issue: z.infer<typeof jiraIssueResponseSchema>;
    try {
      issue = jiraIssueResponseSchema.parse(await response.json());
    } catch (error) {
      throw new Error(`Jira returned an invalid issue response for ${reference}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const acceptanceCriteriaText = jiraValueToText(issue.fields[this.options.acceptanceCriteriaField]);
    // Jira Cloud returns rich-text custom fields as Atlassian Document Format (ADF).
    // Preserve its authored structure for the document body instead of flattening it
    // into an AI-generated replacement design.
    const technicalDesign = jiraValueToMarkdown(issue.fields[this.options.technicalDesignField]);
    return {
      id: reference,
      summary: jiraValueToText(issue.fields.summary),
      description: acceptanceCriteriaText,
      acceptanceCriteriaText,
      technicalDesign,
    };
  }

  private headers(): HeadersInit {
    if (this.options.bearerToken) return { Accept: "application/json", Authorization: `Bearer ${this.options.bearerToken}` };
    if (this.options.email && this.options.apiToken) {
      const encoded = Buffer.from(`${this.options.email}:${this.options.apiToken}`).toString("base64");
      return { Accept: "application/json", Authorization: `Basic ${encoded}` };
    }
    throw new Error("Configure JIRA_BEARER_TOKEN or JIRA_EMAIL and JIRA_API_TOKEN before using Jira ingestion.");
  }

  private issueUrl(reference: string): URL {
    const issuePath = `/rest/api/3/issue/${encodeURIComponent(reference)}`;
    if (this.options.cloudId) return new URL(`/ex/jira/${encodeURIComponent(this.options.cloudId)}${issuePath}`, "https://api.atlassian.com");
    return new URL(issuePath, this.options.baseUrl);
  }
}

function fromEnvironment(): JiraStoryProviderOptions {
  const baseUrl = process.env.JIRA_BASE_URL;
  const acceptanceCriteriaField = process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD;
  const technicalDesignField = process.env.JIRA_TECHNICAL_DESIGN_FIELD;
  if (!baseUrl || !acceptanceCriteriaField || !technicalDesignField) {
    throw new Error("Configure JIRA_BASE_URL, JIRA_ACCEPTANCE_CRITERIA_FIELD, and JIRA_TECHNICAL_DESIGN_FIELD, or use --story-file and optional --design-file.");
  }
  const options = {
    baseUrl,
    acceptanceCriteriaField,
    technicalDesignField,
    bearerToken: process.env.JIRA_BEARER_TOKEN,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    cloudId: process.env.JIRA_CLOUD_ID,
  };
  validateJiraAuthentication(options);
  return options;
}

function validateJiraAuthentication(options: Pick<JiraStoryProviderOptions, "bearerToken" | "email" | "apiToken" | "cloudId">): void {
  const hasBasicCredentials = Boolean(options.email || options.apiToken);
  if (options.bearerToken && hasBasicCredentials) {
    throw new Error("Configure either JIRA_BEARER_TOKEN or JIRA_EMAIL and JIRA_API_TOKEN, not both.");
  }
  if (!options.bearerToken && (!options.email || !options.apiToken)) {
    throw new Error("Configure JIRA_BEARER_TOKEN or both JIRA_EMAIL and JIRA_API_TOKEN before using Jira ingestion.");
  }
  if (options.cloudId && options.bearerToken) {
    throw new Error("JIRA_CLOUD_ID is for scoped API-token authentication. Use JIRA_EMAIL and JIRA_API_TOKEN instead of JIRA_BEARER_TOKEN.");
  }
}

function validateJiraBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("JIRA_BASE_URL must be a valid HTTPS URL.");
  }
  const localDevelopmentHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localDevelopmentHost)) throw new Error("JIRA_BASE_URL must use HTTPS. HTTP is permitted only for localhost development.");
}

function jiraValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as { type?: string; text?: string; content?: unknown[]; value?: string };
  if (node.text) return node.text;
  if (node.value) return node.value;
  if (Array.isArray(node.content)) return node.content.map(jiraValueToText).filter(Boolean).join(node.type === "paragraph" || node.type === "listItem" ? "\n" : "");
  return "";
}

type JiraAdfNode = {
  type?: string;
  text?: string;
  value?: string;
  content?: unknown[];
  attrs?: { level?: number; language?: string; href?: string; url?: string; text?: string };
  marks?: Array<{ type?: string; attrs?: { href?: string } }>;
};

/** Convert Jira ADF to Markdown while retaining the authored text and structure. */
function jiraValueToMarkdown(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return renderAdfNode(value).trim();
}

function renderAdfNode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as JiraAdfNode;
  if (node.text !== undefined) return applyAdfMarks(node.text, node.marks ?? []);
  if (node.value) return node.value;

  const children = (node.content ?? []).map(renderAdfNode).filter(Boolean);
  const joined = children.join("");
  switch (node.type) {
    case "doc":
      return children.join("\n\n");
    case "paragraph":
      return joined;
    case "heading":
      return `${"#".repeat(clampHeadingLevel(node.attrs?.level))} ${joined}`;
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${indentListItem(renderAdfNode(item))}`).join("\n");
    case "orderedList":
      return (node.content ?? []).map((item, index) => `${index + 1}. ${indentListItem(renderAdfNode(item))}`).join("\n");
    case "listItem":
      return children.join("\n");
    case "table":
      return renderAdfTable(node);
    case "tableRow":
      return children.join("\n");
    case "tableHeader":
    case "tableCell":
      return children.join("\n");
    case "hardBreak":
      return "\n";
    case "codeBlock": {
      const language = node.attrs?.language?.trim();
      return `\`\`\`${language ?? ""}\n${joined}\n\`\`\``;
    }
    case "blockquote":
      return joined.split("\n").map((line) => `> ${line}`).join("\n");
    case "inlineCard":
      return node.attrs?.url ?? node.attrs?.text ?? "";
    case "mention":
      return node.attrs?.text ?? "";
    default:
      return children.join(node.type === "text" ? "" : "\n");
  }
}

/**
 * Jira rich-text tables are represented by ADF table/tableRow/tableCell nodes.
 * Preserve their authored rows and cells as Markdown so the model never needs
 * to infer that a sequence of field values was intended to be a table.
 */
function renderAdfTable(node: JiraAdfNode): string {
  const rows = (node.content ?? [])
    .filter(isAdfNodeOfType("tableRow"))
    .map(renderAdfTableRow)
    .filter((row) => row.length > 0);
  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [...row, ...Array<string>(columnCount - row.length).fill("")]);
  const [header, ...body] = normalizedRows;
  return [renderMarkdownTableRow(header), renderMarkdownTableRow(header.map(() => "---")), ...body.map(renderMarkdownTableRow)].join("\n");
}

function renderAdfTableRow(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const row = value as JiraAdfNode;
  return (row.content ?? [])
    .filter((cell) => isAdfNodeOfType("tableHeader")(cell) || isAdfNodeOfType("tableCell")(cell))
    .map((cell) => renderAdfNode(cell).trim().replaceAll("|", "\\|").replaceAll("\n", "<br>"));
}

function renderMarkdownTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function isAdfNodeOfType(type: string): (value: unknown) => boolean {
  return (value): boolean => Boolean(value && typeof value === "object" && (value as JiraAdfNode).type === type);
}

function applyAdfMarks(text: string, marks: NonNullable<JiraAdfNode["marks"]>): string {
  return marks.reduce((rendered, mark) => {
    switch (mark.type) {
      case "strong": return `**${rendered}**`;
      case "em": return `*${rendered}*`;
      case "strike": return `~~${rendered}~~`;
      case "code": return `\`${rendered}\``;
      case "link": return mark.attrs?.href ? `[${rendered}](${mark.attrs.href})` : rendered;
      default: return rendered;
    }
  }, text);
}

function clampHeadingLevel(level: number | undefined): number {
  if (typeof level !== "number" || !Number.isInteger(level)) return 2;
  return Math.min(6, Math.max(1, level));
}

function indentListItem(value: string): string {
  return value.trim().replaceAll("\n", "\n  ");
}

import { z } from "zod";
import type { StoryContent } from "../schemas.js";
import type { StoryProvider } from "./storyProvider.js";

const jiraIssueResponseSchema = z.object({ fields: z.record(z.unknown()) });
const defaultRequestTimeoutMs = 15_000;

export type JiraStoryProviderOptions = {
  baseUrl: string;
  acceptanceCriteriaField: string;
  technicalDesignField: string;
  bearerToken?: string;
  email?: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Jira adapter intentionally asks for only the two configured custom fields.
 * Jira field IDs are configurable because custom field IDs differ by instance.
 */
export class JiraStoryProvider implements StoryProvider {
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: JiraStoryProviderOptions = fromEnvironment()) {
    validateJiraBaseUrl(options.baseUrl);
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error("JIRA request timeout must be a positive integer.");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async getStory(reference: string): Promise<StoryContent> {
    const fields = [this.options.acceptanceCriteriaField, this.options.technicalDesignField];
    const url = new URL(`/rest/api/3/issue/${encodeURIComponent(reference)}`, this.options.baseUrl);
    url.searchParams.set("fields", fields.join(","));
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
    let issue: z.infer<typeof jiraIssueResponseSchema>;
    try {
      issue = jiraIssueResponseSchema.parse(await response.json());
    } catch (error) {
      throw new Error(`Jira returned an invalid issue response for ${reference}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const acceptanceCriteriaText = jiraValueToText(issue.fields[this.options.acceptanceCriteriaField]);
    const technicalDesign = jiraValueToText(issue.fields[this.options.technicalDesignField]);
    return {
      id: reference,
      summary: "",
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
}

function fromEnvironment(): JiraStoryProviderOptions {
  const baseUrl = process.env.JIRA_BASE_URL;
  const acceptanceCriteriaField = process.env.JIRA_ACCEPTANCE_CRITERIA_FIELD;
  const technicalDesignField = process.env.JIRA_TECHNICAL_DESIGN_FIELD;
  if (!baseUrl || !acceptanceCriteriaField || !technicalDesignField) {
    throw new Error("Configure JIRA_BASE_URL, JIRA_ACCEPTANCE_CRITERIA_FIELD, and JIRA_TECHNICAL_DESIGN_FIELD, or use --story-file and optional --design-file.");
  }
  return {
    baseUrl,
    acceptanceCriteriaField,
    technicalDesignField,
    bearerToken: process.env.JIRA_BEARER_TOKEN,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  };
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

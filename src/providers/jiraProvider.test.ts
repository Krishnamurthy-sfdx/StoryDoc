import test from "node:test";
import assert from "node:assert/strict";
import { JiraStoryProvider } from "./jiraProvider.js";

test("requests only summary, Acceptance Criteria, and Technical Design fields", async () => {
  let requestedUrl = "";
  const progress: string[] = [];
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ fields: {
        summary: "Eligibility automation",
        customfield_10001: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "AC-1: Validate eligibility." }] }] },
        customfield_10002: "Create an EligibilityService Apex class.",
      } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  }, (message) => progress.push(message));
  const story = await provider.getStory("APP-142");
  assert.equal(new URL(requestedUrl).searchParams.get("fields"), "summary,customfield_10001,customfield_10002");
  assert.equal(new URL(requestedUrl).searchParams.has("expand"), false);
  assert.equal(story.acceptanceCriteriaText, "AC-1: Validate eligibility.");
  assert.equal(story.technicalDesign, "Create an EligibilityService Apex class.");
  assert.equal(story.summary, "Eligibility automation");
  assert.match(progress[0], /summary, customfield_10001 \(Acceptance Criteria\), customfield_10002 \(Technical Design\)/);
  assert.match(progress[1], /response received/);
});

test("preserves Jira ADF technical-design structure as Markdown", async () => {
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ fields: {
      summary: "Subscription automation",
      customfield_10001: "AC",
      customfield_10002: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Subscription flow" }] },
          { type: "paragraph", content: [{ type: "text", text: "Create " }, { type: "text", text: "Subscription__c", marks: [{ type: "code" }] }, { type: "text", text: " when an opportunity closes." }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Activate the flow." }] }] }] },
        ],
      },
    } }), { status: 200 }),
  });

  const story = await provider.getStory("SCRUM-1");
  assert.equal(story.technicalDesign, "## Subscription flow\n\nCreate `Subscription__c` when an opportunity closes.\n\n- Activate the flow.");
});

test("preserves Jira ADF tables as Markdown tables", async () => {
  const text = (value: string, marks?: Array<{ type: string }>) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
  const cell = (type: "tableHeader" | "tableCell", ...content: object[]) => ({ type, content: [{ type: "paragraph", content }] });
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ fields: {
      summary: "Subscription fields",
      customfield_10001: "AC",
      customfield_10002: {
        type: "doc",
        content: [{
          type: "table",
          content: [
            { type: "tableRow", content: [cell("tableHeader", text("Field Label")), cell("tableHeader", text("API Name")), cell("tableHeader", text("Type")), cell("tableHeader", text("Details"))] },
            { type: "tableRow", content: [cell("tableCell", text("Start Date")), cell("tableCell", text("Start_Date__c", [{ type: "code" }])), cell("tableCell", text("Date")), cell("tableCell", text("Required | tracked"), { type: "hardBreak" }, text("Used when a subscription starts."))] },
          ],
        }],
      },
    } }), { status: 200 }),
  });

  const story = await provider.getStory("SCRUM-1");
  assert.equal(story.technicalDesign, [
    "| Field Label | API Name | Type | Details |",
    "| --- | --- | --- | --- |",
    "| Start Date | `Start_Date__c` | Date | Required \\| tracked<br>Used when a subscription starts. |",
  ].join("\n"));
});

test("uses the scoped-token gateway when a Jira cloud ID is configured", async () => {
  let requestedUrl = "";
  let authorization = "";
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    cloudId: "4761c6a3-2f62-44af-b9b1-3ff4bd896007",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    email: "developer@example.com",
    apiToken: "scoped-token",
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      authorization = String((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ fields: { summary: "Scoped story", customfield_10001: "AC", customfield_10002: "Design" } }), { status: 200 });
    },
  });
  await provider.getStory("APP-142");
  assert.equal(new URL(requestedUrl).origin, "https://api.atlassian.com");
  assert.equal(new URL(requestedUrl).pathname, "/ex/jira/4761c6a3-2f62-44af-b9b1-3ff4bd896007/rest/api/3/issue/APP-142");
  assert.match(authorization, /^Basic /);
});

test("rejects ambiguous Jira authentication configuration", () => {
  assert.throws(() => new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "integration-token",
    email: "developer@example.com",
    apiToken: "api-token",
  }), /not both/);
});

test("rejects non-HTTPS JIRA URLs", () => {
  assert.throws(() => new JiraStoryProvider({
    baseUrl: "http://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
  }), /must use HTTPS/);
});

test("validates the JIRA response shape", async () => {
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ issue: "not-an-issue" }), { status: 200 }),
  });
  await assert.rejects(provider.getStory("APP-142"), /invalid issue response/);
});

test("aborts a JIRA request after the configured timeout", async () => {
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    timeoutMs: 1,
    fetchImpl: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  await assert.rejects(provider.getStory("APP-142"), /timed out/);
});

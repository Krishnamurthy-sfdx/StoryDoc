import test from "node:test";
import assert from "node:assert/strict";
import { JiraStoryProvider } from "./jiraProvider.js";

test("requests only Acceptance Criteria and Technical Design fields", async () => {
  let requestedUrl = "";
  const provider = new JiraStoryProvider({
    baseUrl: "https://jira.example.com",
    acceptanceCriteriaField: "customfield_10001",
    technicalDesignField: "customfield_10002",
    bearerToken: "test-token",
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ fields: {
        customfield_10001: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "AC-1: Validate eligibility." }] }] },
        customfield_10002: "Create an EligibilityService Apex class.",
      } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const story = await provider.getStory("APP-142");
  assert.equal(new URL(requestedUrl).searchParams.get("fields"), "customfield_10001,customfield_10002");
  assert.equal(new URL(requestedUrl).searchParams.has("expand"), false);
  assert.equal(story.acceptanceCriteriaText, "AC-1: Validate eligibility.");
  assert.equal(story.technicalDesign, "Create an EligibilityService Apex class.");
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

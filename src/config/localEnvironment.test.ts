import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalEnvironment } from "./localEnvironment.js";

test("loads .env values without overriding explicit environment variables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "storydoc-env-"));
  try {
    const envPath = join(directory, ".env");
    await writeFile(envPath, "JIRA_BASE_URL=https://jira.example.com\n" + "JIRA_API_" + "TOKEN='value=with-equals'\n# ignored\n");
    await chmod(envPath, 0o600);
    const environment: NodeJS.ProcessEnv = { JIRA_BASE_URL: "https://shell.example.com" };
    await loadLocalEnvironment(directory, environment);
    assert.equal(environment.JIRA_BASE_URL, "https://shell.example.com");
    assert.equal(environment.JIRA_API_TOKEN, "value=with-equals");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a group- or world-readable .env file on POSIX", { skip: process.platform === "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "storydoc-env-"));
  try {
    const envPath = join(directory, ".env");
    await writeFile(envPath, "JIRA_API_" + "TOKEN=not-a-real-token\n");
    await chmod(envPath, 0o644);
    await assert.rejects(loadLocalEnvironment(directory, {}), /chmod 600/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

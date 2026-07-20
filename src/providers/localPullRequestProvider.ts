import { readFile } from "node:fs/promises";
import { pullRequestSchema } from "../schemas.js";
import type { PullRequestProvider } from "./pullRequestProvider.js";

export class LocalPullRequestProvider implements PullRequestProvider {
  public constructor(private readonly filePath: string) {}
  public async getPullRequest(prNumber: number) {
    const parsed = pullRequestSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    if (parsed.number !== prNumber) throw new Error(`PR fixture contains #${parsed.number}, not #${prNumber}.`);
    return parsed;
  }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pullRequestSchema, type ChangedFile, type PullRequestDetails } from "../schemas.js";
import { assertDiffWithinLimit, configuredMaximumDiffBytes } from "../security.js";
import type { PullRequestProvider } from "./pullRequestProvider.js";

const execFileAsync = promisify(execFile);
type ProgressReporter = (message: string) => void;
type GhFile = { path?: string; additions?: number; deletions?: number; status?: string; changeType?: string };
type GhPullRequest = { number?: number; title?: string; body?: string | null; headRefName?: string; baseRefName?: string; state?: string; files?: GhFile[] };

/** Uses the authenticated gh executable; StoryDoc contains no GitHub API client or token handling. */
export class GitHubCliPullRequestProvider implements PullRequestProvider {
  public constructor(
    private readonly workingDirectory: string,
    private readonly maximumOutputBytes = Math.max(10 * 1024 * 1024, configuredMaximumDiffBytes() + 1024 * 1024),
    private readonly reportProgress?: ProgressReporter,
  ) {}

  public async getPullRequest(prNumber: number): Promise<PullRequestDetails> {
    this.reportProgress?.(`[1/7] GitHub CLI: fetching PR #${prNumber} metadata and changed-file list with gh pr view...`);
    const metadata = await this.runGhJson<GhPullRequest>(["pr", "view", String(prNumber), "--json", "number,title,body,headRefName,baseRefName,state,files"]);
    this.reportProgress?.(`[1/7] GitHub CLI: metadata received; fetching PR #${prNumber} diff with gh pr diff...`);
    const diff = await this.runGh(["pr", "diff", String(prNumber)]);
    this.reportProgress?.(`[1/7] GitHub CLI: diff received (${Buffer.byteLength(diff, "utf8")} bytes).`);
    assertDiffWithinLimit(diff);
    const changedFiles = (metadata.files ?? []).filter((file): file is GhFile & { path: string } => Boolean(file.path)).map((file) => this.mapFile(file));
    return pullRequestSchema.parse({ number: metadata.number ?? prNumber, title: metadata.title ?? "", description: metadata.body ?? "", sourceBranch: metadata.headRefName ?? "", targetBranch: metadata.baseRefName ?? "", status: metadata.state ?? "UNKNOWN", changedFiles, diff });
  }

  private mapFile(file: GhFile & { path: string }): ChangedFile {
    const raw = (file.status ?? file.changeType ?? "unknown").toLowerCase();
    const status = (["added", "modified", "deleted", "renamed", "copied"] as const).includes(raw as never) ? raw as ChangedFile["status"] : "changed";
    return { path: file.path, status, additions: file.additions, deletions: file.deletions };
  }

  private async runGhJson<T>(args: string[]): Promise<T> {
    const output = await this.runGh(args);
    try { return JSON.parse(output) as T; } catch { throw new Error("The gh CLI returned invalid JSON while loading the pull request."); }
  }

  private async runGh(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("gh", args, { cwd: this.workingDirectory, maxBuffer: this.maximumOutputBytes });
      return stdout;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
      if (code === "ENOENT") throw new Error("The GitHub CLI (gh) is not installed or is not available on PATH. Install gh, run `gh auth login`, then retry StoryDoc.");
      throw new Error(`Unable to load pull request data through the gh CLI. Authenticate with gh and verify PR ${args[2] ?? "number"} exists (exit code: ${code}).`);
    }
  }
}

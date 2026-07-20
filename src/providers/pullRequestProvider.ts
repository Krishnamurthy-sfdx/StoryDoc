import type { PullRequestDetails } from "../schemas.js";

export interface PullRequestProvider {
  getPullRequest(prNumber: number): Promise<PullRequestDetails>;
}

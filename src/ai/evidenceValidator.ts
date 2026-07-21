import type { ChangedFile, ImplementationAnalysis } from "../schemas.js";
import { technicalDesignContainsSource } from "../technicalDesignEvidence.js";

/**
 * Ensures Luna can only add document updates that are traceable to both the supplied
 * Jira Technical Design and files changed by the pull request.
 */
export function validateFileEvidence(analysis: ImplementationAnalysis, changedFiles: ChangedFile[], technicalDesign: string): void {
  const realPaths = new Set(changedFiles.map((file) => file.path));
  const inventedPaths = analysis.technicalDesignAdjustments
    .flatMap((adjustment) => adjustment.evidencePaths)
    .filter((path) => !realPaths.has(path));
  if (inventedPaths.length > 0) {
    throw new Error(`Luna referenced files that are not in the pull request: ${[...new Set(inventedPaths)].join(", ")}`);
  }

  for (const adjustment of analysis.technicalDesignAdjustments) {
    if (adjustment.type === "added-in-pr") {
      if (adjustment.sourceText.trim()) {
        throw new Error("Luna must leave sourceText empty for an added-in-pr adjustment.");
      }
      continue;
    }
    if (!adjustment.sourceText.trim()) {
      throw new Error(`Luna must quote the Jira Technical Design for a ${adjustment.type} adjustment.`);
    }
    if (!technicalDesignContainsSource(technicalDesign, adjustment.sourceText)) {
      throw new Error("Luna referenced Jira Technical Design text that was not supplied. sourceText must be a literal Jira quotation, not a paraphrase.");
    }
  }
}

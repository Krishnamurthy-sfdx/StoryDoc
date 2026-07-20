import type { ChangedFile, ComponentAnalysis } from "../schemas.js";

export function validateFileEvidence(analysis: { components: ComponentAnalysis[] }, changedFiles: ChangedFile[]): void {
  const realPaths = new Set(changedFiles.map((file) => file.path));
  const invented = analysis.components.map((component) => component.path).filter((path) => !realPaths.has(path));
  if (invented.length > 0) throw new Error(`Sol referenced files that are not in the pull request: ${invented.join(", ")}`);
}

/** A file-like value with a repository path. */
export type PathFile = { path: string };

export type DiffCompressionResult<T extends PathFile> = {
  originalFiles: T[];
  filteredFiles: T[];
  originalDiff: string;
  compressedDiff: string;
};

const noisyFileSuffixes = [".cls-meta.xml", ".profile-meta.xml", ".permissionset-meta.xml", "package-lock.json"];

/**
 * Removes Salesforce metadata noise that adds little implementation signal to an LLM prompt.
 * The original objects are returned unchanged for files that survive the filter.
 */
export function filterSalesforceNoise<T extends PathFile>(files: T[]): T[] {
  return files.filter((file) => {
    const normalizedPath = file.path.replaceAll("\\", "/").toLowerCase();
    const isNoisySuffix = noisyFileSuffixes.some((suffix) => normalizedPath.endsWith(suffix));
    const isTranslationFile = normalizedPath.split("/").includes("translations");
    return !isNoisySuffix && !isTranslationFile;
  });
}

/** Apply both prompt-reduction passes and retain the original values for an audit report. */
export function compressPullRequestInput<T extends PathFile>(files: T[], rawDiff: string): DiffCompressionResult<T> {
  return {
    originalFiles: files,
    filteredFiles: filterSalesforceNoise(files),
    originalDiff: rawDiff,
    compressedDiff: extractDiffHunks(rawDiff),
  };
}

const hunkHeaderPattern = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/;

/**
 * Keeps file headers and changed lines from a multi-file diff, with at most two
 * unchanged context lines on either side of each changed region.
 */
export function extractDiffHunks(rawDiff: string): string {
  const lines = rawDiff.replaceAll("\r\n", "\n").split("\n");
  const output: string[] = [];
  let currentHunk: string[] | undefined;

  const flushHunk = () => {
    if (!currentHunk) return;
    output.push(...compressHunk(currentHunk));
    currentHunk = undefined;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flushHunk();
      output.push(line);
      continue;
    }
    if (hunkHeaderPattern.test(line)) {
      flushHunk();
      currentHunk = [line];
      continue;
    }
    if (currentHunk) currentHunk.push(line);
  }
  flushHunk();
  return output.join("\n").replace(/\n+$/, "");
}

function compressHunk(hunk: string[]): string[] {
  const header = hunk[0];
  const body = hunk.slice(1).filter((line) => line.startsWith("+") || line.startsWith("-") || line.startsWith(" "));
  const changedIndexes = body.flatMap((line, index) => isChangedLine(line) ? [index] : []);
  const keep = new Set<number>();

  for (const changedIndex of changedIndexes) {
    keep.add(changedIndex);
    let contextBefore = 0;
    for (let index = changedIndex - 1; index >= 0 && contextBefore < 2; index -= 1) {
      if (!body[index].startsWith(" ")) break;
      keep.add(index);
      contextBefore += 1;
    }
    let contextAfter = 0;
    for (let index = changedIndex + 1; index < body.length && contextAfter < 2; index += 1) {
      if (!body[index].startsWith(" ")) break;
      keep.add(index);
      contextAfter += 1;
    }
  }

  return [header, ...body.filter((_line, index) => keep.has(index))];
}

function isChangedLine(line: string): boolean {
  return (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---");
}

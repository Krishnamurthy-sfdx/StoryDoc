/**
 * Matches a model quotation to Jira source without accepting a paraphrase. The
 * fallback normalizes only Markdown decoration, whitespace, and typographic
 * punctuation that models commonly omit while copying a literal Jira statement.
 */
export function technicalDesignContainsSource(technicalDesign: string, sourceText: string): boolean {
  if (!sourceText.trim()) return false;
  if (technicalDesign.includes(sourceText)) return true;
  const normalizedSource = normalizeTechnicalDesignEvidence(sourceText);
  return Boolean(normalizedSource) && normalizeTechnicalDesignEvidence(technicalDesign).includes(normalizedSource);
}

/** Returns the authored Jira heading containing a literal or format-normalized quote. */
export function findTechnicalDesignSectionHeading(technicalDesign: string, sourceText: string): string {
  const normalizedSource = normalizeTechnicalDesignEvidence(sourceText);
  if (!normalizedSource) return "";

  let currentHeading = "";
  let currentSection = "";
  for (const line of technicalDesign.replaceAll("\r\n", "\n").split("\n")) {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading?.[1]) {
      currentHeading = heading[1].trim();
      currentSection = line;
    } else {
      currentSection += `${currentSection ? "\n" : ""}${line}`;
    }
    if (normalizeTechnicalDesignEvidence(currentSection).includes(normalizedSource)) return currentHeading;
  }
  return "";
}

export function normalizeTechnicalDesignEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("\u00a0", " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

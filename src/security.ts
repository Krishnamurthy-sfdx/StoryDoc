import { relative, resolve, sep } from "node:path";

const safeSegmentPattern = /[^A-Za-z0-9._-]+/g;
const maximumSegmentLength = 120;

/** Convert user-controlled identifiers into safe, single-directory-name segments. */
export function safeOutputSegment(value: string): string {
  const segment = value.trim().replace(safeSegmentPattern, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, maximumSegmentLength);
  if (!segment || segment === "." || segment === "..") throw new Error("The ticket must contain at least one safe output-directory character.");
  return segment;
}

export function resolveStoryOutputDirectory(workingDirectory: string, outputDirectory: string, ticket: string): string {
  const outputRoot = resolve(workingDirectory, outputDirectory);
  const destination = resolve(outputRoot, safeOutputSegment(ticket));
  const relativeDestination = relative(outputRoot, destination);
  if (!relativeDestination || relativeDestination === ".." || relativeDestination.startsWith(`..${sep}`)) {
    throw new Error("The StoryDoc output path must remain inside the configured output directory.");
  }
  return destination;
}

const sensitivePatterns: RegExp[] = [
  /-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g,
  /(^|\n)(\s*[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)\s*=\s*)([^\n]+)/g,
  /(^|\n)(\s*(?:PRIVATE[_-]?KEY)\s*=\s*)([^\n]+)/g,
  /\b(?:ghp_|github_pat_|xoxb-|xoxp-|sk-)[A-Za-z0-9_\-]{12,}\b/g,
  /\bATATT[A-Za-z0-9_=-]{20,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/._=-]{16,}\b/gi,
  /\b(?:authorization|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password)\s*[:=]\s*["']?[^\s,"']{8,}["']?/gi,
];

export function redactSensitiveText(value: string): string {
  return sensitivePatterns.reduce((redacted, pattern) => redacted.replace(pattern, (...matches: unknown[]) => {
    const prefix = typeof matches[1] === "string" && (pattern.source.startsWith("(^|\\n)") || pattern.source.startsWith("\\b(?:authorization")) ? matches[1] : "";
    if (pattern.source.startsWith("(^|\\n)")) return `${prefix}${matches[2]}[REDACTED BY STORYDOC]`;
    if (pattern.source.startsWith("\\b(?:authorization")) return `${prefix}[REDACTED BY STORYDOC]`;
    return "[REDACTED BY STORYDOC]";
  }), value);
}

/** Redact likely credentials from model input and every generated string field. */
export function redactSensitiveContent<T>(value: T): T {
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactSensitiveContent(item)) as T;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactSensitiveContent(item)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export const defaultMaximumDiffBytes = 5 * 1024 * 1024;

export function configuredMaximumDiffBytes(): number {
  const configured = process.env.STORYDOC_MAX_DIFF_BYTES;
  if (!configured) return defaultMaximumDiffBytes;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("STORYDOC_MAX_DIFF_BYTES must be a positive integer.");
  return parsed;
}

export function assertDiffWithinLimit(diff: string): void {
  const actualBytes = Buffer.byteLength(diff, "utf8");
  const maximumBytes = configuredMaximumDiffBytes();
  if (actualBytes > maximumBytes) {
    throw new Error(`The pull request diff is ${actualBytes} bytes, above StoryDoc's configured limit of ${maximumBytes} bytes. Set STORYDOC_MAX_DIFF_BYTES to increase it or use a smaller pull request.`);
  }
}

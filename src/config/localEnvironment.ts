import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

type Environment = NodeJS.ProcessEnv;

/**
 * Loads a project-local .env without overwriting explicit shell or CI variables.
 * The file must not be readable by group or other users on POSIX systems.
 */
export async function loadLocalEnvironment(workingDirectory = process.cwd(), environment: Environment = process.env): Promise<void> {
  const path = resolve(workingDirectory, ".env");
  let metadata: Awaited<ReturnType<typeof stat>>;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (isMissingFile(error)) return;
    throw new Error(`Unable to read local configuration file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error(`Local configuration file ${path} is readable by other users. Run: chmod 600 ${path}`);
  }
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read local configuration file ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const [key, value] of parseEnvironment(source)) {
    if (environment[key] === undefined) environment[key] = value;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseEnvironment(source: string): Array<[string, string]> {
  const variables: Array<[string, string]> = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    variables.push([match[1], parseValue(match[2])]);
  }
  return variables;
}

function parseValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "");
}

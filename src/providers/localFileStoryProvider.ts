import { readFile } from "node:fs/promises";
import { storyContentSchema } from "../schemas.js";
import type { StoryProvider } from "./storyProvider.js";

export class LocalFileStoryProvider implements StoryProvider {
  public constructor(private readonly storyFile: string, private readonly designFile?: string) {}
  public async getStory(reference: string) {
    const description = await readFile(this.storyFile, "utf8");
    const technicalDesign = this.designFile ? await readFile(this.designFile, "utf8") : "";
    return storyContentSchema.parse({ id: reference, summary: extractSummary(description), description, acceptanceCriteriaText: description, technicalDesign });
  }
}

function extractSummary(content: string): string {
  const heading = content.match(/^#{1,6}\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();
  return content.match(/^Summary:\s*(.+)$/im)?.[1]?.trim() ?? "";
}

import type { StoryContent } from "../schemas.js";

export interface StoryProvider { getStory(reference: string): Promise<StoryContent>; }

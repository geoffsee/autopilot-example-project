import { $ } from "bun";

export type CommitEntry = {
  sha: string;
  author: string;
  timestamp: string;
  message: string;
};

export function parseGitLog(output: string): CommitEntry[] {
  if (!output.trim()) return [];
  return output
    .split("\n")
    .filter((line) => line.trim() && line.includes("\x1f"))
    .flatMap((line): CommitEntry[] => {
      const parts = line.split("\x1f");
      if (parts.length < 4) return [];
      const [sha, author, timestamp, ...rest] = parts;
      return [{ sha: sha!, author: author!, timestamp: timestamp!, message: rest.join("\x1f") }];
    });
}

export async function getAgentHistory(limit = 20): Promise<CommitEntry[]> {
  try {
    const result = await $`git log -n ${limit} --format=%H%x1f%an%x1f%aI%x1f%s`.text();
    return parseGitLog(result);
  } catch {
    return [];
  }
}

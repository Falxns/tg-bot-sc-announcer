import { readFile, writeFile } from "fs/promises";
import { LOG_LEVEL, POSTS_PER_AUTHOR } from "./config";

export const DEFAULT_EXBO_AUTHORS = [
  "Marxont",
  "dolgodoomal",
  "zubzalinaza",
  "Kommynist",
  "Mediocree",
  "ZIV",
  "Furgon",
  "pinkDog",
  "barmeh34",
  "normist",
  "_Emelasha_",
  "ooveronika",
  "6eximmortal",
  "AngryKitty",
  "grin_d",
  "nastexe",
  "Erildorian",
  "litrkerasina",
  "psychosociaI",
  "Plastinka",
  "ProstoDuke",
  "CeredJa",
  "Folken",
  "Tarnum",
  "t_lightwood",
  "SMEKTA",
  "RomeO",
  "stm:76561198077736822",
  "Jilee",
  "Gorlyli",
  "Tigorex",
  "Velery",
  "HiPPiE",
  "Opisth",
  "heheckler",
  "WWtddw",
  "Targgot",
];

/** Exbo forum usernames to poll for new comments. Loaded from state file, falls back to DEFAULT_EXBO_AUTHORS. */
export let exboAuthors: string[] = [...DEFAULT_EXBO_AUTHORS];

/** Replace the tracked author list (e.g. after /removeauthor). */
export function replaceExboAuthors(next: string[]): void {
  exboAuthors = next;
}

/** Per-author: list of last seen post IDs (oldest first). At most POSTS_PER_AUTHOR per author. */
export const lastSeenByAuthor = new Map<string, string[]>();

export async function loadState(path: string): Promise<void> {
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) {
      // Old format: plain array of ids – no per-author info, start with empty lastSeenByAuthor
    } else if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const byAuthor = obj.lastSeenByAuthor;
      if (byAuthor !== null && typeof byAuthor === "object" && !Array.isArray(byAuthor)) {
        for (const [author, ids] of Object.entries(byAuthor)) {
          if (Array.isArray(ids)) {
            const strIds = ids.filter((x): x is string => typeof x === "string").slice(0, POSTS_PER_AUTHOR);
            if (strIds.length > 0) lastSeenByAuthor.set(author, strIds);
          }
        }
      }
      const authors = obj.authors;
      if (Array.isArray(authors)) {
        const strAuthors = authors.filter((x): x is string => typeof x === "string");
        if (strAuthors.length > 0) exboAuthors = strAuthors;
      }
    }
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn")
    ) {
      console.warn("Could not load state, starting fresh:", err);
    }
  }
}

export async function saveState(path: string): Promise<boolean> {
  try {
    const state = {
      lastSeenByAuthor: Object.fromEntries(lastSeenByAuthor),
      authors: exboAuthors,
    };
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to save state:", err);
    return false;
  }
}

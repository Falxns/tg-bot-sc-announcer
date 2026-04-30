import { readFile, writeFile } from "fs/promises";
import { LOG_LEVEL, POSTS_PER_AUTHOR } from "./config";
import type { DiscordRolePanelState } from "./discord/types";

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
/** Persisted role panel definitions keyed by Discord message ID. */
export const discordRolePanels = new Map<string, DiscordRolePanelState>();
/** Per-user moderation warning counters keyed by `${guildId}:${userId}`. */
export const discordModerationWarnings = new Map<string, number>();

function warningKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function setDiscordRolePanel(panel: DiscordRolePanelState): void {
  discordRolePanels.set(panel.messageId, panel);
}

export function getDiscordRolePanel(messageId: string): DiscordRolePanelState | undefined {
  return discordRolePanels.get(messageId);
}

export function deleteDiscordRolePanel(messageId: string): void {
  discordRolePanels.delete(messageId);
}

export function incrementDiscordWarning(guildId: string, userId: string): number {
  const key = warningKey(guildId, userId);
  const next = (discordModerationWarnings.get(key) ?? 0) + 1;
  discordModerationWarnings.set(key, next);
  return next;
}

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
      const panels = obj.discordRolePanels;
      if (panels && typeof panels === "object" && !Array.isArray(panels)) {
        for (const [messageId, value] of Object.entries(panels as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const panel = value as Record<string, unknown>;
          const guildId = typeof panel.guildId === "string" ? panel.guildId : "";
          const channelId = typeof panel.channelId === "string" ? panel.channelId : "";
          const buttonsRaw = Array.isArray(panel.buttons) ? panel.buttons : [];
          const buttons = buttonsRaw
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
            .map((x) => ({
              customId: typeof x.customId === "string" ? x.customId : "",
              roleId: typeof x.roleId === "string" ? x.roleId : "",
              label: typeof x.label === "string" ? x.label : "",
            }))
            .filter((x) => x.customId.startsWith("role:") && x.roleId.length > 0)
            .map((x) => ({
              ...x,
              label: x.label.trim().length > 0 ? x.label.trim() : "\u200b",
            }));
          if (!guildId || !channelId || buttons.length === 0) continue;
          discordRolePanels.set(messageId, { messageId, guildId, channelId, buttons });
        }
      }
      const warnings = obj.discordModerationWarnings;
      if (warnings && typeof warnings === "object" && !Array.isArray(warnings)) {
        for (const [key, value] of Object.entries(warnings as Record<string, unknown>)) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 1) continue;
          discordModerationWarnings.set(key, Math.floor(value));
        }
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
      discordRolePanels: Object.fromEntries(discordRolePanels),
      discordModerationWarnings: Object.fromEntries(discordModerationWarnings),
    };
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to save state:", err);
    return false;
  }
}

import { LOG_LEVEL, POSTS_PER_AUTHOR, STATE_BACKEND } from "./config";
import type { DiscordRolePanelState } from "./discord/types";
import { createStateStore } from "./stateStore";

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
  "Kazugaia",
  "DikiyTaburet",
  "Kotler",
];

/** Exbo forum usernames to poll for new comments. Loaded from state storage, falls back to DEFAULT_EXBO_AUTHORS. */
export let exboAuthors: string[] = [...DEFAULT_EXBO_AUTHORS];

/** Replace the tracked author list (e.g. after /removeauthor). */
export function replaceExboAuthors(next: string[]): void {
  exboAuthors = next;
}

/** Per-author: list of last seen post IDs (oldest first). At most POSTS_PER_AUTHOR per author. */
export const lastSeenByAuthor = new Map<string, string[]>();
/** Persisted role panel definitions keyed by Discord message ID. */
export const discordRolePanels = new Map<string, DiscordRolePanelState>();

/** Per-channel minor warning counts: `${guildId}:${warningScopeChannelId}:${userId}`. */
export const discordMinorWarnings = new Map<string, number>();
/** Guild-level minor mute escalation: `${guildId}:${userId}` → tier index (applied ladder step). */
export const discordMinorMuteTier = new Map<string, number>();
/** Guild-level major mute escalation: `${guildId}:${userId}`. */
export const discordMajorMuteTier = new Map<string, number>();
/** Last moderation violation time (ms): `${guildId}:${userId}` for decay. */
export const discordModerationLastViolationAt = new Map<string, number>();

/** Migrated guild-wide warnings bucket until merged into a real channel scope. */
export const LEGACY_MINOR_WARNING_SCOPE = "legacy";

const ROLE_BUTTON_PREFIX = "role:";
const ROLE_BUTTON_SINGLE_PREFIX = "roleone:";

export function guildUserKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function minorWarningKey(guildId: string, warningScopeChannelId: string, userId: string): string {
  return `${guildId}:${warningScopeChannelId}:${userId}`;
}

/** Merge legacy guild-wide count into the first write for this scope. */
export function getMinorWarningCount(guildId: string, warningScopeChannelId: string, userId: string): number {
  const scopeKey = minorWarningKey(guildId, warningScopeChannelId, userId);
  const legacyKey = minorWarningKey(guildId, LEGACY_MINOR_WARNING_SCOPE, userId);
  const scoped = discordMinorWarnings.get(scopeKey) ?? 0;
  const legacy = discordMinorWarnings.get(legacyKey) ?? 0;
  return scoped + legacy;
}

/** Increment minor warnings for channel scope; consumes legacy bucket into this scope on first touch. */
export function incrementMinorWarning(guildId: string, warningScopeChannelId: string, userId: string): number {
  const scopeKey = minorWarningKey(guildId, warningScopeChannelId, userId);
  const legacyKey = minorWarningKey(guildId, LEGACY_MINOR_WARNING_SCOPE, userId);
  const legacy = discordMinorWarnings.get(legacyKey) ?? 0;
  if (legacy > 0) {
    discordMinorWarnings.delete(legacyKey);
  }
  const base = (discordMinorWarnings.get(scopeKey) ?? 0) + legacy;
  const next = base + 1;
  discordMinorWarnings.set(scopeKey, next);
  return next;
}

export function setMinorWarningCount(
  guildId: string,
  warningScopeChannelId: string,
  userId: string,
  value: number,
): void {
  const scopeKey = minorWarningKey(guildId, warningScopeChannelId, userId);
  const legacyKey = minorWarningKey(guildId, LEGACY_MINOR_WARNING_SCOPE, userId);
  discordMinorWarnings.delete(legacyKey);
  if (value <= 0) discordMinorWarnings.delete(scopeKey);
  else discordMinorWarnings.set(scopeKey, value);
}

export function adjustMinorWarningCount(
  guildId: string,
  warningScopeChannelId: string,
  userId: string,
  delta: number,
): number {
  const current = getMinorWarningCount(guildId, warningScopeChannelId, userId);
  const next = Math.max(0, current + delta);
  setMinorWarningCount(guildId, warningScopeChannelId, userId, next);
  return next;
}

/** Raw per-scope warning rows from state (excludes zero counts). Sorted by count desc, then scope id. */
export function listMinorWarningEntriesForGuildUser(guildId: string, userId: string): { scopeId: string; count: number }[] {
  const prefix = `${guildId}:`;
  const suffix = `:${userId}`;
  const out: { scopeId: string; count: number }[] = [];
  for (const [key, count] of discordMinorWarnings) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    if (typeof count !== "number" || count <= 0) continue;
    const scopeId = key.slice(prefix.length, key.length - suffix.length);
    out.push({ scopeId, count });
  }
  out.sort((a, b) => b.count - a.count || a.scopeId.localeCompare(b.scopeId));
  return out;
}

export function getMinorMuteTier(guildId: string, userId: string): number {
  return discordMinorMuteTier.get(guildUserKey(guildId, userId)) ?? 0;
}

/** Returns ladder index used for this mute; advances stored tier (capped at lastLadderIndex). */
export function consumeMinorMuteTierForApply(guildId: string, userId: string, lastLadderIndex: number): number {
  const key = guildUserKey(guildId, userId);
  const cur = discordMinorMuteTier.get(key) ?? 0;
  const idx = Math.min(cur, lastLadderIndex);
  discordMinorMuteTier.set(key, Math.min(cur + 1, lastLadderIndex));
  return idx;
}

export function getMajorMuteTier(guildId: string, userId: string): number {
  return discordMajorMuteTier.get(guildUserKey(guildId, userId)) ?? 0;
}

/** Returns ladder index used for this mute; advances stored tier (capped at lastLadderIndex). */
export function consumeMajorMuteTierForApply(guildId: string, userId: string, lastLadderIndex: number): number {
  const key = guildUserKey(guildId, userId);
  const cur = discordMajorMuteTier.get(key) ?? 0;
  const idx = Math.min(cur, lastLadderIndex);
  discordMajorMuteTier.set(key, Math.min(cur + 1, lastLadderIndex));
  return idx;
}

export function touchModerationViolation(guildId: string, userId: string, nowMs: number): void {
  discordModerationLastViolationAt.set(guildUserKey(guildId, userId), nowMs);
}

/**
 * If user had no violations for `decayMs`, reset minor warnings (all channels), minor/major tiers.
 * Returns true if decay was applied.
 */
export function applyModerationDecayIfNeeded(guildId: string, userId: string, nowMs: number, decayMs: number): boolean {
  const key = guildUserKey(guildId, userId);
  const last = discordModerationLastViolationAt.get(key);
  if (last === undefined) return false;
  if (nowMs - last < decayMs) return false;

  for (const k of [...discordMinorWarnings.keys()]) {
    if (k.startsWith(`${guildId}:`) && k.endsWith(`:${userId}`)) {
      discordMinorWarnings.delete(k);
    }
  }
  discordMinorMuteTier.delete(key);
  discordMajorMuteTier.delete(key);
  discordModerationLastViolationAt.delete(key);
  return true;
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

function parseNumberMap(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const n = Math.floor(value);
    if (n < 0) continue;
    out.set(key, n);
  }
  return out;
}

export async function loadState(path: string): Promise<void> {
  try {
    const store = createStateStore(path);
    const data = await store.readState();
    if (!data) {
      if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
        const where =
          STATE_BACKEND === "upstash"
            ? "Upstash (empty key or first run)"
            : `file ${path} (missing or empty)`;
        console.log(`State load: no persisted data (${where}).`);
      }
      return;
    }
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
          const singleRole = panel.singleRole === true;
          const buttonsRaw = Array.isArray(panel.buttons) ? panel.buttons : [];
          const buttons = buttonsRaw
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
            .map((x) => ({
              customId: typeof x.customId === "string" ? x.customId : "",
              roleId: typeof x.roleId === "string" ? x.roleId : "",
              label: typeof x.label === "string" ? x.label : "",
            }))
            .filter(
              (x) =>
                (x.customId.startsWith(ROLE_BUTTON_PREFIX) || x.customId.startsWith(ROLE_BUTTON_SINGLE_PREFIX)) &&
                x.roleId.length > 0,
            )
            .map((x) => ({
              ...x,
              label: x.label.trim().length > 0 ? x.label.trim() : "\u200b",
            }));
          if (!guildId || !channelId || buttons.length === 0) continue;
          discordRolePanels.set(messageId, { messageId, guildId, channelId, buttons, singleRole });
        }
      }

      const minor = obj.discordMinorWarnings;
      if (minor && typeof minor === "object" && !Array.isArray(minor)) {
        for (const [k, v] of parseNumberMap(minor)) {
          discordMinorWarnings.set(k, v);
        }
      }
      const minorT = obj.discordMinorMuteTier;
      if (minorT && typeof minorT === "object" && !Array.isArray(minorT)) {
        for (const [k, v] of parseNumberMap(minorT)) {
          discordMinorMuteTier.set(k, v);
        }
      }
      const majorT = obj.discordMajorMuteTier;
      if (majorT && typeof majorT === "object" && !Array.isArray(majorT)) {
        for (const [k, v] of parseNumberMap(majorT)) {
          discordMajorMuteTier.set(k, v);
        }
      }
      const lastV = obj.discordModerationLastViolationAt;
      if (lastV && typeof lastV === "object" && !Array.isArray(lastV)) {
        for (const [k, v] of parseNumberMap(lastV)) {
          discordModerationLastViolationAt.set(k, v);
        }
      }

      const warnings = obj.discordModerationWarnings;
      if (warnings && typeof warnings === "object" && !Array.isArray(warnings)) {
        for (const [key, value] of Object.entries(warnings as Record<string, unknown>)) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 1) continue;
          const n = Math.floor(value);
          const parts = key.split(":");
          if (parts.length === 2) {
            const [guildId, userId] = parts;
            if (guildId && userId) {
              const legacyKey = minorWarningKey(guildId, LEGACY_MINOR_WARNING_SCOPE, userId);
              const prev = discordMinorWarnings.get(legacyKey) ?? 0;
              discordMinorWarnings.set(legacyKey, Math.max(prev, n));
            }
          }
        }
      }
    }
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
      console.log(
        `State loaded (${STATE_BACKEND}): ${exboAuthors.length} authors, ` +
          `${lastSeenByAuthor.size} lastSeen, ${discordRolePanels.size} role panels, ` +
          `${discordMinorWarnings.size} minor warnings, ${discordMinorMuteTier.size} minor tiers, ` +
          `${discordMajorMuteTier.size} major tiers.`,
      );
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
    const store = createStateStore(path);
    const state = {
      lastSeenByAuthor: Object.fromEntries(lastSeenByAuthor),
      authors: exboAuthors,
      discordRolePanels: Object.fromEntries(discordRolePanels),
      discordMinorWarnings: Object.fromEntries(discordMinorWarnings),
      discordMinorMuteTier: Object.fromEntries(discordMinorMuteTier),
      discordMajorMuteTier: Object.fromEntries(discordMajorMuteTier),
      discordModerationLastViolationAt: Object.fromEntries(discordModerationLastViolationAt),
    };
    await store.writeState(JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to save state:", err);
    return false;
  }
}

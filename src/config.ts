import type { DiscordChannelPolicy, DiscordChannelPolicyMap, ViolationSeverity } from "./discord/types";

export function clampParseInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_IDS = process.env.TELEGRAM_CHANNEL_IDS ?? "";
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID?.trim() ?? "";
export type StateBackend = "file" | "upstash";
export const STATE_BACKEND: StateBackend = process.env.STATE_BACKEND === "upstash" ? "upstash" : "file";
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
export const UPSTASH_STATE_KEY = process.env.UPSTASH_STATE_KEY?.trim() || "tg-bot-sc-announcer:state";
export const POLL_INTERVAL_MS = clampParseInt(process.env.POLL_INTERVAL_MS ?? "300000", 60_000, 86400_000);
export const AUTHOR_REQUEST_DELAY_MS = clampParseInt(process.env.AUTHOR_REQUEST_DELAY_MS ?? "1000", 100, 60_000);
export const TELEGRAM_SEND_DELAY_MS = clampParseInt(process.env.TELEGRAM_SEND_DELAY_MS ?? "500", 0, 60_000);
export const LAST_SEEN_STATE_FILE = process.env.LAST_SEEN_STATE_FILE ?? "last-seen-posts.json";
export const POSTS_PER_AUTHOR = clampParseInt(process.env.POSTS_PER_AUTHOR ?? "5", 1, 50);
export const MAX_SNIPPET_LEN = clampParseInt(process.env.MAX_SNIPPET_LEN ?? "1000", 100, 4000);
export const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase();
export const SKIP_SEND_POST_OLDER_THAN_MS = (() => {
  const raw = process.env.SKIP_SEND_POST_OLDER_THAN_MS ?? "3600000";
  const n = parseInt(raw, 10);
  if (n === 0) return 0;
  if (!Number.isFinite(n)) return 3600000;
  return Math.max(60_000, Math.min(86400_000, n));
})();
/** Max PostMention expansions per comment (each may trigger GET /api/posts/:id). */
export const POST_MENTION_MAX_PER_POST = clampParseInt(process.env.POST_MENTION_MAX_PER_POST ?? "5", 0, 15);
/** Max plain-text length for injected quoted post body (after stripHtml). */
export const POST_MENTION_BODY_PLAIN_MAX = clampParseInt(process.env.POST_MENTION_BODY_PLAIN_MAX ?? "1200", 200, 8000);
/** Max distinct PostMention `data-id` fetches per message for nested quotes (0 = skip, use discussion link only). */
export const QUOTE_POST_MENTION_MAX = clampParseInt(process.env.QUOTE_POST_MENTION_MAX ?? "20", 0, 50);
/** Delay between PostMention fetches to reduce burst load on the forum. */
export const POST_MENTION_FETCH_DELAY_MS = clampParseInt(process.env.POST_MENTION_FETCH_DELAY_MS ?? "250", 0, 5000);
/** Telegram Bot API 7.4+ expandable blockquotes (`<blockquote expandable>`). */
export const TELEGRAM_EXPANDABLE_BLOCKQUOTES = !/^0|false$/i.test(process.env.TELEGRAM_EXPANDABLE_BLOCKQUOTES ?? "1");
export const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Role IDs that may use `/post` and `/rolepanel` (when non-empty; otherwise any member passing Discord command perms). */
export const DISCORD_ADMIN_ROLE_IDS = (process.env.DISCORD_ADMIN_ROLE_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const DISCORD_ROLE_PANEL_CHANNEL_ID = (process.env.DISCORD_ROLE_PANEL_CHANNEL_ID ?? "").trim();
export const DISCORD_INVITE_ALLOWED_ROLE_IDS = (process.env.DISCORD_INVITE_ALLOWED_ROLE_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const DISCORD_BLOCK_INVITE_LINKS_GLOBAL = !/^0|false$/i.test(
  process.env.DISCORD_BLOCK_INVITE_LINKS_GLOBAL ?? "0",
);
/** Server-wide strikes required before ladder timeout applies (must match automod /strike logic). */
export const DISCORD_WARNINGS_BEFORE_TIMEOUT = clampParseInt(
  process.env.DISCORD_WARNINGS_BEFORE_TIMEOUT ?? "3",
  1,
  20,
);
/** @deprecated No longer used. */
export const DISCORD_TIMEOUT_MS = clampParseInt(process.env.DISCORD_TIMEOUT_MS ?? "600000", 60_000, 604800_000);
export const DISCORD_WARNING_MESSAGE_TTL_MS = clampParseInt(
  process.env.DISCORD_WARNING_MESSAGE_TTL_MS ?? "12000",
  1000,
  600_000,
);

const DEFAULT_TIMEOUT_LADDER_MS = [
  3_600_000,
  21_600_000,
  43_200_000,
  86_400_000,
  259_200_000,
  604_800_000,
] as const;

function parseMsLadder(raw: string | undefined, fallback: readonly number[]): number[] {
  const s = raw?.trim();
  if (!s) return [...fallback];
  const parts = s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 60_000 && n <= 2_419_200_000);
  return parts.length > 0 ? parts : [...fallback];
}

/** Unified automod/staff timeout ladder (1h, 6h, 12h, 1d, 3d, 7d by default). */
export const DISCORD_TIMEOUT_LADDER_MS = parseMsLadder(
  process.env.DISCORD_TIMEOUT_LADDER_MS,
  DEFAULT_TIMEOUT_LADDER_MS,
);

/** Ladder index for first major hit (default: 1 day = index 3). */
export const DISCORD_MAJOR_MIN_LADDER_STEP = clampParseInt(
  process.env.DISCORD_MAJOR_MIN_LADDER_STEP ?? "3",
  0,
  Math.max(0, DISCORD_TIMEOUT_LADDER_MS.length - 1),
);

/** No violations for this long → reset global strikes + mute tier (default 3 days). */
export const DISCORD_MODERATION_DECAY_MS = clampParseInt(
  process.env.DISCORD_MODERATION_DECAY_MS ?? "259200000",
  60_000,
  2_419_200_000,
);

export const DISCORD_MODERATION_LOG_CHANNEL_ID = (process.env.DISCORD_MODERATION_LOG_CHANNEL_ID ?? "").trim();

/** Optional one-line staff digest channel (manual mod commands, role creates, creator posts). */
export const DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID = (
  process.env.DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID ?? ""
).trim();

function parseCommaSeparatedIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Staff-summary role events: audit-log executor must have one of these roles.
 * Applies to guild role create, and member role assign/remove (not role-panel bot toggles).
 */
export const DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS = parseCommaSeparatedIds(
  process.env.DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS,
);

/** Delay before reading audit log for role create / member role update (ms). */
export const DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS = clampParseInt(
  process.env.DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS ??
    process.env.DISCORD_STAFF_SUMMARY_ROLE_CREATE_AUDIT_DELAY_MS ??
    "1000",
  200,
  10_000,
);

/** Creator post summaries: watch messages in these channel IDs (not threads). */
export const DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS = parseCommaSeparatedIds(
  process.env.DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS,
);

/** Creator post summaries: author must have one of these roles. */
export const DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS = parseCommaSeparatedIds(
  process.env.DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS,
);

/** Min gap between creator digest lines per author+channel (default 30 min). */
export const DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS = clampParseInt(
  process.env.DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS ?? String(30 * 60_000),
  60_000,
  86_400_000,
);

function parseSeverity(raw: unknown, fallback: ViolationSeverity): ViolationSeverity {
  if (raw === "major" || raw === "minor") return raw;
  return fallback;
}

function parseDiscordChannelPolicies(raw: string): DiscordChannelPolicyMap {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DiscordChannelPolicyMap = {};
    for (const [channelId, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const row = v as Record<string, unknown>;
      const policy: DiscordChannelPolicy = {
        blockInviteLinks: row.blockInviteLinks === true,
        allowInviteRoleIds: Array.isArray(row.allowInviteRoleIds)
          ? row.allowInviteRoleIds.filter((x): x is string => typeof x === "string")
          : [],
        allowDiscordInvites: row.allowDiscordInvites === true,
        inviteViolationSeverity: parseSeverity(row.inviteViolationSeverity, "major"),
        blockVideos: row.blockVideos === true,
        blockImages: row.blockImages === true,
        blockText: row.blockText === true,
        blockedKeywords: Array.isArray(row.blockedKeywords)
          ? row.blockedKeywords
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean)
          : [],
        keywordViolationSeverity: parseSeverity(row.keywordViolationSeverity, "minor"),
        mediaViolationSeverity: parseSeverity(row.mediaViolationSeverity, "minor"),
        reasonPresetId:
          typeof row.reasonPresetId === "string" && row.reasonPresetId.trim().length > 0
            ? row.reasonPresetId.trim()
            : undefined,
      };
      out[channelId] = policy;
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_CHANNEL_POLICIES_JSON, using empty policy set.");
    return {};
  }
}

function parseDomainBlacklist(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const j = JSON.parse(s) as unknown;
      if (!Array.isArray(j)) return [];
      return j
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase().replace(/^\.+/, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase().replace(/^\.+/, ""))
    .filter(Boolean);
}

export const DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST = parseDomainBlacklist(
  process.env.DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST ?? "",
);

/** Channel/thread IDs where duplicate-message (same author, consecutive) spam filter runs. Empty = disabled. */
export const DISCORD_SPAM_FILTER_CHANNEL_IDS: ReadonlySet<string> = new Set(
  (process.env.DISCORD_SPAM_FILTER_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export const chatIds = TELEGRAM_CHANNEL_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean);
export const DISCORD_CHANNEL_POLICIES = parseDiscordChannelPolicies(process.env.DISCORD_CHANNEL_POLICIES_JSON ?? "");

function parseModerationReasonChannelIds(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [presetId, channelId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof channelId === "string" && /^\d{17,20}$/.test(channelId.trim())) {
        out[presetId] = channelId.trim();
      }
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_MODERATION_REASON_CHANNEL_IDS_JSON, using empty map.");
    return {};
  }
}

/** Preset id → Discord channel snowflake for clickable #channel in reason text. */
export const DISCORD_MODERATION_REASON_CHANNEL_IDS = parseModerationReasonChannelIds(
  process.env.DISCORD_MODERATION_REASON_CHANNEL_IDS_JSON ?? "",
);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

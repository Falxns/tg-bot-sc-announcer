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
/** When true, guild slash commands are removed on graceful shutdown (local dev bot on prod guild). */
export const DISCORD_DEV_MODE = !/^0|false$/i.test(
  (process.env.DISCORD_DEV_MODE ?? "0").trim(),
);
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
/** Role IDs that may use `/post`, `/edit`, `/rolepanel`, `/editrolepanel`, `/linkpanel`, `/editlinkpanel` (when non-empty). */
export const DISCORD_ADMIN_ROLE_IDS = (process.env.DISCORD_ADMIN_ROLE_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Role IDs that may use moderation slash (`/mute`, `/strike`, `/ban`, …); also allowed if member has an admin role. Bot role needs Discord timeout/ban perms. */
export const DISCORD_MODERATOR_ROLE_IDS = (process.env.DISCORD_MODERATOR_ROLE_IDS ?? "")
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
export const DISCORD_WARNING_MESSAGE_TTL_MS = clampParseInt(
  process.env.DISCORD_WARNING_MESSAGE_TTL_MS ?? "30000",
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

/** Max manual /mute + /strike + /ban per moderator per UTC day (0 = disabled). */
export const DISCORD_MODERATION_DAILY_QUOTA = clampParseInt(
  process.env.DISCORD_MODERATION_DAILY_QUOTA ?? "30",
  0,
  500,
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

/** Wait for role rename after create before posting digest (ms); `roleUpdate` can post sooner. */
export const DISCORD_STAFF_SUMMARY_ROLE_CREATE_NAME_WAIT_MS = clampParseInt(
  process.env.DISCORD_STAFF_SUMMARY_ROLE_CREATE_NAME_WAIT_MS ?? "60000",
  2000,
  60_000,
);

/** Merge same mod + role assign/remove into one summary line with (+N) counter (ms). */
export const DISCORD_STAFF_SUMMARY_ROLE_CHANGE_BATCH_MS = clampParseInt(
  process.env.DISCORD_STAFF_SUMMARY_ROLE_CHANGE_BATCH_MS ?? "300000",
  10_000,
  600_000,
);

/** Mod review: post to this channel when author self-deletes a cached media/URL message. */
export const DISCORD_MESSAGE_REVIEW_CHANNEL_ID = (
  process.env.DISCORD_MESSAGE_REVIEW_CHANNEL_ID ?? ""
).trim();

/** Channels where messages are cached for delete-only review (comma-separated). */
export const DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS = parseCommaSeparatedIds(
  process.env.DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS,
);

export const DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_SET: ReadonlySet<string> = new Set(
  DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_IDS,
);

/** In-memory cache TTL before eviction (default 1 hour). */
export const DISCORD_MESSAGE_REVIEW_CACHE_TTL_MS = clampParseInt(
  process.env.DISCORD_MESSAGE_REVIEW_CACHE_TTL_MS ?? "3600000",
  60_000,
  86_400_000,
);

export const DISCORD_MESSAGE_REVIEW_MAX_CACHE_ENTRIES = clampParseInt(
  process.env.DISCORD_MESSAGE_REVIEW_MAX_CACHE_ENTRIES ?? "5000",
  100,
  50_000,
);

export const DISCORD_MESSAGE_REVIEW_BYPASS_ROLE_IDS = parseCommaSeparatedIds(
  process.env.DISCORD_MESSAGE_REVIEW_BYPASS_ROLE_IDS,
);

export const DISCORD_MESSAGE_REVIEW_INCLUDE_URLS = !/^0|false$/i.test(
  process.env.DISCORD_MESSAGE_REVIEW_INCLUDE_URLS ?? "1",
);

export const DISCORD_MESSAGE_REVIEW_MAX_ATTACHMENT_MB = clampParseInt(
  process.env.DISCORD_MESSAGE_REVIEW_MAX_ATTACHMENT_MB ?? "8",
  1,
  25,
);

export const DISCORD_MESSAGE_REVIEW_AUDIT_DELAY_MS = clampParseInt(
  process.env.DISCORD_MESSAGE_REVIEW_AUDIT_DELAY_MS ?? "2000",
  200,
  5_000,
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
        channelPresetId:
          typeof row.channelPresetId === "string" && row.channelPresetId.trim().length > 0
            ? row.channelPresetId.trim()
            : undefined,
        rulePresetId:
          typeof row.rulePresetId === "string" && row.rulePresetId.trim().length > 0
            ? row.rulePresetId.trim()
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

export type SpamFilterChannelOptions = {
  crossAuthor?: boolean;
  cooldownMs?: number;
};

const DEFAULT_CROSS_AUTHOR_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function parseSpamFilterChannelOptions(raw: string): Record<string, SpamFilterChannelOptions> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, SpamFilterChannelOptions> = {};
    for (const [channelId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d{17,20}$/.test(channelId.trim())) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      const crossAuthor = row.crossAuthor === true;
      const cooldownRaw = row.cooldownMs;
      const cooldownMs =
        typeof cooldownRaw === "number" && Number.isFinite(cooldownRaw)
          ? clampParseInt(String(Math.floor(cooldownRaw)), 60_000, 7 * 24 * 60 * 60 * 1000)
          : crossAuthor
            ? DEFAULT_CROSS_AUTHOR_COOLDOWN_MS
            : undefined;
      out[channelId.trim()] = {
        ...(crossAuthor ? { crossAuthor: true } : {}),
        ...(cooldownMs !== undefined ? { cooldownMs } : {}),
      };
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_SPAM_FILTER_CHANNEL_OPTIONS_JSON, using empty options.");
    return {};
  }
}

/** Per-channel overrides: cross-author duplicate cooldown (see README). Keys are channel/thread snowflakes. */
export const DISCORD_SPAM_FILTER_CHANNEL_OPTIONS = parseSpamFilterChannelOptions(
  process.env.DISCORD_SPAM_FILTER_CHANNEL_OPTIONS_JSON ?? "",
);

export const DISCORD_SPAM_FILTER_MAX_FINGERPRINTS_PER_SCOPE = clampParseInt(
  process.env.DISCORD_SPAM_FILTER_MAX_FINGERPRINTS_PER_SCOPE ?? "200",
  10,
  2000,
);

/** Resolve spam options for message channel or warn-scope parent channel. */
export function resolveSpamFilterChannelOptions(
  channelId: string,
  warningScopeChannelId: string,
): SpamFilterChannelOptions | undefined {
  return (
    DISCORD_SPAM_FILTER_CHANNEL_OPTIONS[channelId] ??
    DISCORD_SPAM_FILTER_CHANNEL_OPTIONS[warningScopeChannelId]
  );
}

export const chatIds = TELEGRAM_CHANNEL_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean);
export const DISCORD_CHANNEL_POLICIES = parseDiscordChannelPolicies(process.env.DISCORD_CHANNEL_POLICIES_JSON ?? "");

function parseModerationChannelPresetChannelIds(raw: string): Record<string, string> {
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
    console.warn("Invalid DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS_JSON, using empty map.");
    return {};
  }
}

/** Channel preset id → Discord channel snowflake for clickable #channel in preset text. */
export const DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS = parseModerationChannelPresetChannelIds(
  process.env.DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS_JSON ?? "",
);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** When false, temp voice handlers no-op (hub, panel, lifecycle). */
export const DISCORD_VOICE_ENABLED = !/^0|false$/i.test(
  (process.env.DISCORD_VOICE_ENABLED ?? "0").trim(),
);
export const DISCORD_VOICE_HUB_CHANNEL_ID = (process.env.DISCORD_VOICE_HUB_CHANNEL_ID ?? "").trim();
export const DISCORD_VOICE_TEMP_CATEGORY_ID = (process.env.DISCORD_VOICE_TEMP_CATEGORY_ID ?? "").trim();
export const DISCORD_VOICE_PANEL_CHANNEL_ID = (process.env.DISCORD_VOICE_PANEL_CHANNEL_ID ?? "").trim();
/** Optional HTTPS URL for the panel embed legend image; default uses bundled assets/discord/voice-panel-legend.png */
export const DISCORD_VOICE_PANEL_IMAGE_URL = (process.env.DISCORD_VOICE_PANEL_IMAGE_URL ?? "").trim();
export const DISCORD_VOICE_DEFAULT_NAME =
  (process.env.DISCORD_VOICE_DEFAULT_NAME ?? "Комната {user}").trim() || "Комната {user}";
export const DISCORD_VOICE_EMPTY_DELETE_MS = clampParseInt(
  process.env.DISCORD_VOICE_EMPTY_DELETE_MS ?? "60000",
  5_000,
  600_000,
);
export const DISCORD_VOICE_MAX_CHANNELS_PER_USER = clampParseInt(
  process.env.DISCORD_VOICE_MAX_CHANNELS_PER_USER ?? "1",
  1,
  5,
);
export const DISCORD_VOICE_INVITE_MAX_AGE_SEC = clampParseInt(
  process.env.DISCORD_VOICE_INVITE_MAX_AGE_SEC ?? "86400",
  0,
  604_800,
);

export type DiscordCustomEmojiRef = { id: string; name: string };

function parseDiscordVoiceButtonEmojis(raw: string): Partial<Record<string, DiscordCustomEmojiRef>> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Partial<Record<string, DiscordCustomEmojiRef>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const id = (value as { id?: unknown }).id;
      const name = (value as { name?: unknown }).name;
      if (typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0) {
        out[key] = { id, name };
      }
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_VOICE_BUTTON_EMOJIS_JSON, using Unicode fallback emojis.");
    return {};
  }
}

export const DISCORD_VOICE_BUTTON_EMOJIS = parseDiscordVoiceButtonEmojis(
  process.env.DISCORD_VOICE_BUTTON_EMOJIS_JSON ?? "",
);

export function tempVoiceConfigured(): boolean {
  return (
    DISCORD_VOICE_ENABLED &&
    DISCORD_VOICE_HUB_CHANNEL_ID.length > 0 &&
    DISCORD_VOICE_TEMP_CATEGORY_ID.length > 0
  );
}

/** When false, clan role command handlers no-op. */
export const DISCORD_CLAN_ENABLED = !/^0|false$/i.test((process.env.DISCORD_CLAN_ENABLED ?? "0").trim());

/** Parent rules post — public thread under it receives plain-text clan commands and grant pending requests. */
export const DISCORD_CLAN_RULES_MESSAGE_ID = (process.env.DISCORD_CLAN_RULES_MESSAGE_ID ?? "").trim();

/** Shared «Лидер клана» meta-role snowflake. */
export const DISCORD_CLAN_LEADER_ROLE_ID = (process.env.DISCORD_CLAN_LEADER_ROLE_ID ?? "").trim();

/**
 * Anchor role snowflake — new clan roles are placed directly above this role in the hierarchy.
 * Bot's highest role must still be above the new clan role.
 */
export const DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID = (
  process.env.DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID ?? ""
).trim();

/** #чат-кланов (or equivalent) — new clan roles get Send Messages allow overwrite here. */
export const DISCORD_CLAN_CHAT_CHANNEL_ID = (process.env.DISCORD_CLAN_CHAT_CHANNEL_ID ?? "").trim();

/**
 * Role IDs excluded from clan discovery.
 * Includes `DISCORD_CLAN_ROLE_EXCLUDE_IDS` from env plus moderator, staff-summary creator, and admin role IDs.
 */
export const DISCORD_CLAN_ROLE_EXCLUDE_IDS = [
  ...new Set([
    ...parseCommaSeparatedIds(process.env.DISCORD_CLAN_ROLE_EXCLUDE_IDS),
    ...DISCORD_MODERATOR_ROLE_IDS,
    ...DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS,
    ...DISCORD_ADMIN_ROLE_IDS,
  ]),
];

/** Optional regex (case-insensitive) — extra filter on role display names. */
export const DISCORD_CLAN_ROLE_NAME_PATTERN = (() => {
  const raw = (process.env.DISCORD_CLAN_ROLE_NAME_PATTERN ?? "").trim();
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    console.warn("Invalid DISCORD_CLAN_ROLE_NAME_PATTERN, ignoring.");
    return null;
  }
})();

export const DISCORD_CLAN_ROSTER_MIN = clampParseInt(process.env.DISCORD_CLAN_ROSTER_MIN ?? "15", 1, 100);
export const DISCORD_CLAN_ROSTER_MAX = clampParseInt(process.env.DISCORD_CLAN_ROSTER_MAX ?? "35", 1, 100);
/** Max clan roles per member (0 = unlimited). Default 1 — leader meta-role is separate. */
export const DISCORD_CLAN_MAX_ROLES_PER_MEMBER = clampParseInt(
  process.env.DISCORD_CLAN_MAX_ROLES_PER_MEMBER ?? "1",
  0,
  20,
);

/** Mod queue channel for new clan create requests. */
export const DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID = (
  process.env.DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID ?? ""
).trim();

/** Optional audit channel for clan actions (falls back to staff summary channel). */
export const DISCORD_CLAN_STAFF_LOG_CHANNEL_ID = (process.env.DISCORD_CLAN_STAFF_LOG_CHANNEL_ID ?? "").trim();

/** Min members with a clan role before auto-purge grace applies (default 10). */
export const DISCORD_CLAN_ACTIVE_MIN_MEMBERS = clampParseInt(
  process.env.DISCORD_CLAN_ACTIVE_MIN_MEMBERS ?? "10",
  1,
  100,
);

/** Days to restore roster or appoint leaders before the bot purges the clan role (default 3). */
export const DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS = clampParseInt(
  process.env.DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS ?? "3",
  1,
  30,
);

/** How often to run clan enforcement checks (default 24h). */
export const DISCORD_CLAN_ENFORCEMENT_CHECK_MS = clampParseInt(
  process.env.DISCORD_CLAN_ENFORCEMENT_CHECK_MS ?? String(24 * 60 * 60 * 1000),
  60_000,
  7 * 24 * 60 * 60 * 1000,
);

export const DISCORD_CLAN_ENFORCEMENT_GRACE_MS = DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

export type ClanColorPreset = { id: string; label: string; hex: number };

function parseClanColorPresets(raw: string): ClanColorPreset[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ClanColorPreset[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id.trim() : "";
      const label =
        typeof (row as { label?: unknown }).label === "string" ? (row as { label: string }).label.trim() : "";
      const hexRaw = (row as { hex?: unknown }).hex;
      let hex = 0;
      if (typeof hexRaw === "number" && Number.isFinite(hexRaw)) {
        hex = Math.max(0, Math.min(0xffffff, Math.floor(hexRaw)));
      } else if (typeof hexRaw === "string") {
        const s = hexRaw.trim().replace(/^#/, "");
        const n = parseInt(s, 16);
        if (Number.isFinite(n)) hex = Math.max(0, Math.min(0xffffff, n));
      }
      if (id && label) out.push({ id, label, hex });
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_CLAN_COLOR_PRESETS_JSON, using built-in presets.");
    return [];
  }
}

export function clanRolesConfigured(): boolean {
  return DISCORD_CLAN_ENABLED && DISCORD_CLAN_LEADER_ROLE_ID.length > 0;
}

export const DISCORD_CLAN_COLOR_PRESETS_FROM_ENV = parseClanColorPresets(
  process.env.DISCORD_CLAN_COLOR_PRESETS_JSON ?? "",
);

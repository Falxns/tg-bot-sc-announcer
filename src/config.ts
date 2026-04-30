import type { DiscordChannelPolicyMap } from "./discord/types";

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
export const DISCORD_WARNINGS_BEFORE_TIMEOUT = clampParseInt(
  process.env.DISCORD_WARNINGS_BEFORE_TIMEOUT ?? "3",
  1,
  20,
);
export const DISCORD_TIMEOUT_MS = clampParseInt(process.env.DISCORD_TIMEOUT_MS ?? "600000", 60_000, 604800_000);
export const DISCORD_WARNING_MESSAGE_TTL_MS = clampParseInt(
  process.env.DISCORD_WARNING_MESSAGE_TTL_MS ?? "12000",
  1000,
  600_000,
);

function parseDiscordChannelPolicies(raw: string): DiscordChannelPolicyMap {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DiscordChannelPolicyMap = {};
    for (const [channelId, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const row = v as Record<string, unknown>;
      out[channelId] = {
        blockInviteLinks: row.blockInviteLinks === true,
        allowInviteRoleIds: Array.isArray(row.allowInviteRoleIds)
          ? row.allowInviteRoleIds.filter((x): x is string => typeof x === "string")
          : [],
        blockVideos: row.blockVideos === true,
        blockImages: row.blockImages === true,
        blockText: row.blockText === true,
        blockedKeywords: Array.isArray(row.blockedKeywords)
          ? row.blockedKeywords
              .filter((x): x is string => typeof x === "string")
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean)
          : [],
      };
    }
    return out;
  } catch {
    console.warn("Invalid DISCORD_CHANNEL_POLICIES_JSON, using empty policy set.");
    return {};
  }
}

export const chatIds = TELEGRAM_CHANNEL_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean);
export const DISCORD_CHANNEL_POLICIES = parseDiscordChannelPolicies(process.env.DISCORD_CHANNEL_POLICIES_JSON ?? "");

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

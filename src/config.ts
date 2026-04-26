export function clampParseInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_IDS = process.env.TELEGRAM_CHANNEL_IDS ?? "";
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

export const chatIds = TELEGRAM_CHANNEL_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

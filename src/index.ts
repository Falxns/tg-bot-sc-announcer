import "dotenv/config";
import { createServer } from "http";
import { readFile, writeFile } from "fs/promises";
import { Telegraf } from "telegraf";
import { enqueueTelegramSend, flushTelegramSendQueue } from "./telegramSendQueue";

const EXBO_POSTS_BASE_URL =
  "https://forum.exbo.ru/api/posts?filter%5Btype%5D=comment&page%5Boffset%5D=0&page%5Blimit%5D=5&sort=-createdAt";

const DEFAULT_EXBO_AUTHORS = [
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
];

/** Exbo forum usernames to poll for new comments. Loaded from state file, falls back to DEFAULT_EXBO_AUTHORS. */
let exboAuthors: string[] = [...DEFAULT_EXBO_AUTHORS];

function getExboPostsUrlForAuthor(author: string): string {
  return `${EXBO_POSTS_BASE_URL}&filter%5Bauthor%5D=${encodeURIComponent(author)}`;
}

function clampParseInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_IDS = process.env.TELEGRAM_CHANNEL_IDS ?? "";
const POLL_INTERVAL_MS = clampParseInt(process.env.POLL_INTERVAL_MS ?? "300000", 60_000, 86400_000);
const AUTHOR_REQUEST_DELAY_MS = clampParseInt(process.env.AUTHOR_REQUEST_DELAY_MS ?? "1000", 100, 60_000);
const TELEGRAM_SEND_DELAY_MS = clampParseInt(process.env.TELEGRAM_SEND_DELAY_MS ?? "500", 0, 60_000);
const LAST_SEEN_STATE_FILE = process.env.LAST_SEEN_STATE_FILE ?? "last-seen-posts.json";
const POSTS_PER_AUTHOR = clampParseInt(process.env.POSTS_PER_AUTHOR ?? "5", 1, 50);
const MAX_SNIPPET_LEN = clampParseInt(process.env.MAX_SNIPPET_LEN ?? "1000", 100, 4000);
const LOG_LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const SKIP_SEND_POST_OLDER_THAN_MS = (() => {
  const raw = process.env.SKIP_SEND_POST_OLDER_THAN_MS ?? "3600000";
  const n = parseInt(raw, 10);
  if (n === 0) return 0;
  if (!Number.isFinite(n)) return 3600000;
  return Math.max(60_000, Math.min(86400_000, n));
})();
/** Max PostMention expansions per comment (each may trigger GET /api/posts/:id). */
const POST_MENTION_MAX_PER_POST = clampParseInt(process.env.POST_MENTION_MAX_PER_POST ?? "5", 0, 15);
/** Max plain-text length for injected quoted post body (after stripHtml). */
const POST_MENTION_BODY_PLAIN_MAX = clampParseInt(process.env.POST_MENTION_BODY_PLAIN_MAX ?? "1200", 200, 8000);
/** Max distinct PostMention `data-id` fetches per message for nested quotes (0 = skip, use discussion link only). */
const QUOTE_POST_MENTION_MAX = clampParseInt(process.env.QUOTE_POST_MENTION_MAX ?? "20", 0, 50);
/** Delay between PostMention fetches to reduce burst load on the forum. */
const POST_MENTION_FETCH_DELAY_MS = clampParseInt(process.env.POST_MENTION_FETCH_DELAY_MS ?? "250", 0, 5000);
/** Telegram Bot API 7.4+ expandable blockquotes (`<blockquote expandable>`). */
const TELEGRAM_EXPANDABLE_BLOCKQUOTES = !/^0|false$/i.test(process.env.TELEGRAM_EXPANDABLE_BLOCKQUOTES ?? "1");
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment. Set it in .env");
  process.exit(1);
}

const chatIds = TELEGRAM_CHANNEL_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function isAdmin(ctx: { from?: { id?: number } }): boolean {
  if (ADMIN_USER_IDS.length === 0) return true;
  const id = ctx.from?.id?.toString();
  return id !== undefined && ADMIN_USER_IDS.includes(id);
}

bot.command("chatid", (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = ctx.chat?.id;
  const type = ctx.chat?.type ?? "unknown";
  if (id === undefined) {
    return ctx.reply("Could not determine chat ID.");
  }
  return ctx.reply(`Chat ID: ${id} (${type})`);
});

bot.command("listauthors", (ctx) => {
  if (!isAdmin(ctx)) return;
  if (exboAuthors.length === 0) {
    return ctx.reply("No Exbo authors configured. Add one with /addauthor <username>");
  }
  return ctx.reply("Tracked Exbo authors:\n" + exboAuthors.map((a) => "• " + a).join("\n"));
});

bot.command("addauthor", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.split(/\s+/).slice(1);
  const username = args.join(" ").trim();
  if (!username) {
    return ctx.reply("Usage: /addauthor <exbo_username>");
  }
  if (exboAuthors.includes(username)) {
    return ctx.reply(`Already tracking "${username}".`);
  }
  exboAuthors.push(username);
  const saved = await saveState(LAST_SEEN_STATE_FILE);
  const msg = `Added "${username}". Now tracking: ${exboAuthors.join(", ")}`;
  return ctx.reply(saved ? msg : msg + "\n\nWarning: failed to save state to disk.");
});

bot.command("removeauthor", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = ctx.message.text.split(/\s+/).slice(1);
  const username = args.join(" ").trim();
  if (!username) {
    return ctx.reply("Usage: /removeauthor <exbo_username>");
  }
  const before = exboAuthors.length;
  exboAuthors = exboAuthors.filter((a) => a !== username);
  if (exboAuthors.length === before) {
    return ctx.reply(`"${username}" was not in the list. Current: ${exboAuthors.join(", ") || "(none)"}`);
  }
  const saved = await saveState(LAST_SEEN_STATE_FILE);
  const msg = `Removed "${username}". Now tracking: ${exboAuthors.join(", ") || "(none)"}`;
  return ctx.reply(saved ? msg : msg + "\n\nWarning: failed to save state to disk.");
});

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One announcement: HTML text plus forum image URLs to send as Telegram photos (same order as `Изображение N` in text). */
type AnnouncePayload = {
  textHtml: string;
  imageUrls: string[];
};

const TELEGRAM_MEDIA_GROUP_MAX = 10;

async function sendWith429Retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 429) {
      await sleep(5000);
      return await fn();
    }
    throw err;
  }
}

async function sendAnnouncementPhotosToChat(chatId: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  let offset = 0;
  while (offset < urls.length) {
    if (offset > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
    const rest = urls.length - offset;
    if (rest === 1) {
      const u = urls[offset]!;
      await sendWith429Retry(() => bot.telegram.sendPhoto(chatId, u));
      offset += 1;
      continue;
    }
    const take = Math.min(TELEGRAM_MEDIA_GROUP_MAX, rest);
    const chunk = urls.slice(offset, offset + take);
    const media = chunk.map((url) => ({ type: "photo" as const, media: url }));
    await sendWith429Retry(() => bot.telegram.sendMediaGroup(chatId, media));
    offset += take;
  }
}

async function sendToTelegramChannels(announcements: AnnouncePayload[]): Promise<void> {
  if (announcements.length === 0) return;
  const sendOptions = {
    parse_mode: "HTML" as const,
    link_preview_options: { is_disabled: true },
  };
  for (const chatId of chatIds) {
    try {
      for (let i = 0; i < announcements.length; i++) {
        if (i > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
        const payload = announcements[i];
        try {
          await sendWith429Retry(() => bot.telegram.sendMessage(chatId, payload.textHtml, sendOptions));
        } catch (sendErr: unknown) {
          throw sendErr;
        }
        try {
          await sendAnnouncementPhotosToChat(chatId, payload.imageUrls);
        } catch (photoErr) {
          console.error("Failed to send Telegram photos for chat", chatId, photoErr);
        }
      }
      if (announcements.length > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
    } catch (err) {
      console.error("Failed to send to Telegram chat", chatId, err);
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

const EXBO_FORUM_BASE = "https://forum.exbo.ru";

function exboApiPostUrl(postId: string): string {
  const id = encodeURIComponent(postId);
  return `${EXBO_FORUM_BASE}/api/posts/${id}?include=user`;
}

function exboApiDiscussionUrl(discussionId: string): string {
  return `${EXBO_FORUM_BASE}/api/discussions/${encodeURIComponent(discussionId)}`;
}

function forumProfileUrl(username: string): string {
  return `${EXBO_FORUM_BASE}/u/${encodeURIComponent(username)}`;
}

/** Telegram hashtag: letters (any script), digits, underscore only; spaces become _. */
function telegramHashtagFromAuthor(name: string): string {
  const tag = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return tag ? `#${tag}` : "";
}

/** Replaces each `<img src>` with `<a href>Изображение N</a>` in document order (`N` = 1.. over valid `src`). */
function replaceImgTagsWithNumberedAnchors(html: string): string {
  let n = 0;
  return html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_m, src: string) => {
    const raw = String(src).replace(/\s+/g, "").trim();
    if (!raw) return "";
    const url = resolveAbsForumUrl(raw);
    n += 1;
    return `<a href="${escapeHtml(url)}">Изображение ${n}</a>`;
  });
}

/** Collects `href`s of image placeholder anchors (`Изображение` + optional number) in HTML order. */
function extractImageUrlsFromAnnouncementHtml(html: string): string[] {
  const urls: string[] = [];
  const re = /<a\s+href=["']([^"']+)["'][^>]*>\s*Изображение(?:\s+\d+)?\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    urls.push(resolveAbsForumUrl(m[1]));
  }
  return urls;
}

/** Temporarily removes image `<a>` tags so plain-HTML processing does not strip their hrefs. */
function guardImageAnchorLinks(html: string): { guarded: string; restores: string[] } {
  const restores: string[] = [];
  const guarded = html.replace(/<a\s+href=["']([^"']+)["'][^>]*>\s*Изображение(?:\s+\d+)?\s*<\/a>/gi, (full) => {
    restores.push(full);
    return `\x7fI${restores.length - 1}I\x7f`;
  });
  return { guarded, restores };
}

function unguardImageAnchorLinks(html: string, restores: string[]): string {
  let out = html;
  for (let i = 0; i < restores.length; i++) {
    out = out.split(`\x7fI${i}I\x7f`).join(restores[i]);
  }
  return out;
}

/** Returns length of visible text (Telegram formatting tags stripped). */
function visibleTextLength(telegramHtml: string): number {
  return telegramHtml.replace(/<[^>]+>/g, "").length;
}

function resolveAbsForumUrl(href: string): string {
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith("//")) return "https:" + h;
  if (h.startsWith("/")) return EXBO_FORUM_BASE + h;
  return EXBO_FORUM_BASE + "/" + h.replace(/^\.\//, "");
}

/** First Flarum user link in a quote: display label and path slug (for /u/slug). */
function extractReplyAuthorFromQuoteInner(innerHtml: string): { display: string; slug: string } | null {
  const re = /<a[^>]+href=["']([^"']*\/u\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/i;
  const m = innerHtml.match(re);
  if (!m) return null;
  const slugPart = m[2];
  const inner = m[3];
  let slug = slugPart.replace(/\+/g, " ");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep slug as-is */
  }
  const display = stripHtml(inner).trim() || slug;
  return { display, slug };
}

/** When there is no /u/ link, use first word of quoted text as the reply author label (Flarum often inlines the name). */
function inferQuotedAuthorFromPlainStart(plain: string): string | null {
  const line = (plain.split("\n")[0] ?? "").trim();
  const w = (line.split(/\s+/)[0] ?? "").replace(/^@/, "");
  if (!w || w.length < 2 || w.length > 48) return null;
  if (!/^[\p{L}\p{N}_-]+$/u.test(w)) return null;
  return w;
}

/** Remove leading author name from plain quote body so it does not repeat under the heading. */
function stripLeadingQuotedAuthorPlain(plain: string, display: string): string {
  if (display === "Пользователь") return plain.trim();
  const esc = display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return plain.replace(new RegExp(`^\\s*${esc}\\s*[,:.;!?]?\\s*`, "iu"), "").trim();
}

/** Plain quote body (after htmlToPlainLines); keeps image `\x7fI…` and PostMention `\x7fM…` placeholders; escapes the rest. */
function quoteBodyFromPlainWithPlaceholders(plain: string): string {
  const parts = plain.split(/(\x7fI\d+I\x7f|\x7fM\d+M\x7f)/);
  return parts
    .map((chunk) => {
      if (/^\x7fI\d+I\x7f$/.test(chunk) || /^\x7fM\d+M\x7f$/.test(chunk)) return chunk;
      return escapeHtml(chunk);
    })
    .join("");
}

function unguardMentionAnchorLinks(html: string, restores: string[]): string {
  let out = html;
  for (let i = 0; i < restores.length; i++) {
    out = out.split(`\x7fM${i}M\x7f`).join(restores[i]);
  }
  return out;
}

/** Removes the first profile <a href=".../u/...">...</a> from quote HTML (avoids duplicating the name line inside the blockquote). */
function removeFirstUserProfileLink(innerHtml: string): string {
  return innerHtml.replace(/<a[^>]+href=["'][^"']*\/u\/[^"']+["'][^>]*>[\s\S]*?<\/a>/i, "").trim();
}

/** Collapses horizontal whitespace; keeps newlines for Telegram HTML. */
function htmlToPlainLines(html: string): string {
  let t = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  t = t.replace(/<\/?p[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  t = t.replace(/ +/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Main reply body: /u/ → profile anchors; /d/ discussion links (e.g. PostMention) stay as anchors. Preserves \x7fI… image placeholders. */
function flarumUserLinksToTelegramMentions(html: string): string {
  const userAnchors: string[] = [];
  let s = html.replace(
    /<a[^>]+href=["']([^"']*\/u\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const abs = resolveAbsForumUrl(href);
      const clean = stripHtml(inner).trim().replace(/^@/, "");
      const label = clean ? `@${clean}` : "@user";
      userAnchors.push(`<a href="${escapeHtml(abs)}">${escapeHtml(label)}</a>`);
      return `\x7fU${userAnchors.length - 1}U\x7f`;
    },
  );
  const discAnchors: string[] = [];
  s = s.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const abs = resolveAbsForumUrl(href);
    if (!/\/d\//i.test(abs)) return _m;
    const clean = stripHtml(inner).trim() || "Сообщение";
    discAnchors.push(`<a href="${escapeHtml(abs)}">${escapeHtml(clean)}</a>`);
    return `\x7fD${discAnchors.length - 1}D\x7f`;
  });
  s = htmlToPlainLines(s);
  s = escapeHtml(s);
  for (let i = 0; i < userAnchors.length; i++) {
    s = s.split(`\x7fU${i}U\x7f`).join(userAnchors[i]);
  }
  for (let i = 0; i < discAnchors.length; i++) {
    s = s.split(`\x7fD${i}D\x7f`).join(discAnchors[i]);
  }
  return s;
}

function telegramBlockquote(innerHtml: string): string {
  if (TELEGRAM_EXPANDABLE_BLOCKQUOTES) {
    return `<blockquote expandable>${innerHtml}</blockquote>`;
  }
  return `<blockquote>${innerHtml}</blockquote>`;
}

type ParsedFlarumPost = {
  contentHtml: string;
  /** Flarum username for /u/… profile link; null if API omitted user. */
  authorUsername: string | null;
  authorDisplayName: string | null;
};

function parseFlarumPostResource(json: unknown): ParsedFlarumPost | null {
  if (json === null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || String(data.type) !== "posts") return null;
  const attrs = data.attributes as Record<string, unknown> | undefined;
  const contentHtml = (attrs?.contentHtml as string) ?? "";
  if (!contentHtml.trim()) return null;

  let authorUsername: string | null = null;
  let authorDisplayName: string | null = null;
  const rels = data.relationships as Record<string, unknown> | undefined;
  const userWrap = rels?.user as Record<string, unknown> | undefined;
  const userData = userWrap?.data as Record<string, unknown> | undefined;
  const userId = userData?.id != null ? String(userData.id) : null;
  if (userId) {
    const included = (obj.included as unknown[]) ?? [];
    for (const inc of included) {
      const item = inc as Record<string, unknown>;
      if (String(item.type) !== "users" || String(item.id) !== userId) continue;
      const a = item.attributes as Record<string, unknown> | undefined;
      const un = (a?.username as string)?.trim();
      if (un) {
        authorUsername = un;
        const dn = (a?.displayName as string)?.trim();
        authorDisplayName = dn || un;
      }
      break;
    }
  }

  return { contentHtml, authorUsername, authorDisplayName };
}

async function fetchExboPostJson(postId: string): Promise<unknown | null> {
  const url = exboApiPostUrl(postId);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= EXBO_FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(EXBO_FETCH_RETRY_DELAY_MS);
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as unknown;
      lastErr = new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
    console.warn("PostMention fetch failed for post", postId, lastErr);
  }
  return null;
}

function parseFlarumDiscussionResource(json: unknown): string | null {
  if (json === null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || String(data.type) !== "discussions") return null;
  const attrs = data.attributes as Record<string, unknown> | undefined;
  const title = (attrs?.title as string)?.trim();
  return title || null;
}

async function fetchExboDiscussionJson(discussionId: string): Promise<unknown | null> {
  const url = exboApiDiscussionUrl(discussionId);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= EXBO_FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(EXBO_FETCH_RETRY_DELAY_MS);
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as unknown;
      lastErr = new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
    console.warn("Discussion fetch failed for", discussionId, lastErr);
  }
  return null;
}

/**
 * Resolves discussion title: `included` map first, else GET /api/discussions/:id (cached per batch).
 */
async function getDiscussionTitle(
  discussionId: string | undefined,
  discussionTitleById: Map<string, string>,
  discussionFetchCache: Map<string, Promise<string | null>>,
): Promise<string | null> {
  if (!discussionId) return null;
  const id = String(discussionId);
  const fromIncluded = discussionTitleById.get(id)?.trim();
  if (fromIncluded) return fromIncluded;
  let p = discussionFetchCache.get(id);
  if (!p) {
    p = (async () => {
      const json = await fetchExboDiscussionJson(id);
      return parseFlarumDiscussionResource(json);
    })();
    discussionFetchCache.set(id, p);
  }
  return await p;
}

/** Truncates forum HTML for a synthetic quote block (plain cap; keeps `<img>` when under cap for global image pass). */
function truncateForumHtmlForMentionQuote(html: string, maxPlainChars: number): string {
  const plain = stripHtml(html);
  if (plain.length <= maxPlainChars) return html.trim();
  return `${escapeHtml(plain.slice(0, maxPlainChars))}…`;
}

/** Leading profile link so quote formatting uses the real poster (not first word of body). */
function postMentionQuoteBlockInnerHtml(parsed: ParsedFlarumPost): string {
  const body = truncateForumHtmlForMentionQuote(parsed.contentHtml, POST_MENTION_BODY_PLAIN_MAX);
  const u = parsed.authorUsername?.trim();
  if (!u) return body;
  const label = (parsed.authorDisplayName?.trim() || u).replace(/\s+/g, " ");
  const lead = `<a href="${escapeHtml(forumProfileUrl(u))}">${escapeHtml(label)}</a> `;
  return `${lead}${body}`;
}

/** True if `index` falls inside a `<blockquote>...</blockquote>` region (any nesting depth). */
function isInsideBlockquote(html: string, index: number): boolean {
  let depth = 0;
  const re = /<\/?blockquote\b[^>]*>/gi;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (index >= cursor && index < m.index && depth > 0) return true;
    const tag = m[0].toLowerCase();
    if (tag.startsWith("</")) depth = Math.max(0, depth - 1);
    else depth++;
    cursor = m.index + m[0].length;
  }
  if (index >= cursor && depth > 0) return true;
  return false;
}

type PostMentionAnchor = { postId: string; full: string; index: number };

/** Ordered PostMention anchors: `<a` with class PostMention and numeric `data-id`. */
function postMentionAnchorsFromHtml(html: string): PostMentionAnchor[] {
  const out: PostMentionAnchor[] = [];
  const re = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const full = m[0];
    const open = full.slice(0, full.indexOf(">") + 1);
    if (!/\bPostMention\b/i.test(open) || !/\bdata-id\s*=\s*["']?\d+/i.test(open)) continue;
    const idm = open.match(/\bdata-id\s*=\s*["']?(\d+)["']?/i);
    if (!idm) continue;
    out.push({ postId: idm[1], full, index: m.index });
  }
  return out;
}

async function expandPostMentionsInContentHtml(
  contentHtml: string,
  postCache: Map<string, Promise<ParsedFlarumPost | null>>,
): Promise<string> {
  if (POST_MENTION_MAX_PER_POST <= 0) return contentHtml;
  const raw = postMentionAnchorsFromHtml(contentHtml);
  if (raw.length === 0) return contentHtml;
  /** Skip mentions nested in `<blockquote>` (quoted HTML); expand the rest. */
  const outsideBq = raw.filter((m) => !isInsideBlockquote(contentHtml, m.index));
  const mentions = outsideBq.slice(0, POST_MENTION_MAX_PER_POST);
  if (mentions.length === 0) return contentHtml;
  const blocks: string[] = [];
  const removals: { index: number; full: string }[] = [];
  let delay = false;
  for (const { postId, full, index } of mentions) {
    if (delay) await sleep(POST_MENTION_FETCH_DELAY_MS);
    delay = true;
    let p = postCache.get(postId);
    if (!p) {
      p = (async () => {
        const json = await fetchExboPostJson(postId);
        return parseFlarumPostResource(json);
      })();
      postCache.set(postId, p);
    }
    const parsed = await p;
    if (!parsed) continue;
    const inner = postMentionQuoteBlockInnerHtml(parsed);
    blocks.push(`<blockquote>${inner}</blockquote>`);
    removals.push({ index, full });
  }
  if (blocks.length === 0) return contentHtml;
  let working = contentHtml;
  const removalOrder = [...removals].sort((a, b) => b.index - a.index);
  for (const { full, index } of removalOrder) {
    if (working.slice(index, index + full.length) === full) {
      working = working.slice(0, index) + working.slice(index + full.length);
    }
  }
  const prefix = blocks.join("\n\n");
  return `${prefix}\n\n${working}`;
}

type PostMentionAuthorRow = { username: string; displayName: string };

async function buildQuotePostMentionAuthorMap(
  postIds: string[],
  postCache: Map<string, Promise<ParsedFlarumPost | null>>,
): Promise<Map<string, PostMentionAuthorRow>> {
  const map = new Map<string, PostMentionAuthorRow>();
  if (QUOTE_POST_MENTION_MAX <= 0 || postIds.length === 0) return map;
  const limited = postIds.slice(0, QUOTE_POST_MENTION_MAX);
  let delay = false;
  for (const id of limited) {
    if (delay) await sleep(POST_MENTION_FETCH_DELAY_MS);
    delay = true;
    let p = postCache.get(id);
    if (!p) {
      p = (async () => {
        const json = await fetchExboPostJson(id);
        return parseFlarumPostResource(json);
      })();
      postCache.set(id, p);
    }
    const parsed = await p;
    const u = parsed?.authorUsername?.trim();
    if (!u) continue;
    const dn = parsed?.authorDisplayName?.trim() || u;
    map.set(id, { username: u, displayName: dn });
  }
  return map;
}

/** Replaces Flarum PostMention `<a>` in quote HTML with `\x7fM…` placeholders; restores are Telegram profile (or discussion) links with @label. */
function injectQuotePostMentionPlaceholders(
  innerHtml: string,
  authorByPostId: Map<string, PostMentionAuthorRow>,
  mentionRestores: string[],
): string {
  return innerHtml.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (full) => {
    const open = full.slice(0, full.indexOf(">") + 1);
    if (!/\bPostMention\b/i.test(open) || !/\bdata-id\s*=\s*["']?\d+/i.test(open)) return full;
    const idm = open.match(/\bdata-id\s*=\s*["']?(\d+)["']?/i);
    if (!idm) return full;
    const postId = idm[1];
    const labelInner = full.match(/>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const label = stripHtml(labelInner).trim() || "user";
    const hrefm = open.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    const discussionHref = hrefm ? resolveAbsForumUrl(hrefm[1]) : EXBO_FORUM_BASE;
    const auth = authorByPostId.get(postId);
    const profileHref = auth ? forumProfileUrl(auth.username) : discussionHref;
    const atLabel = `@${(auth?.displayName ?? label).replace(/^@/, "")}`;
    const anchor = `<a href="${escapeHtml(profileHref)}">${escapeHtml(atLabel)}</a>`;
    const idx = mentionRestores.length;
    mentionRestores.push(anchor);
    return `\x7fM${idx}M\x7f`;
  });
}

/**
 * Formats Exbo comment HTML for Telegram: bell header, quoted blocks (Name написал + blockquote),
 * author reply (написал if no quotes else ответил). Top-level blockquotes use depth-aware parsing so
 * nested `<blockquote>` stays inside one quote. PostMentions inside quotes resolve to @display profile links.
 * Optional `discussionTitle` is shown after the bell header as `В теме: ` plus a bold title when the comment body is non-empty;
 * snippet truncation budget for `middle` is reduced by that line’s visible length. No <i>. See parseBlockquoteSegments.
 */
async function formatCommentTelegramHtml(
  authorDisplayName: string,
  contentHtml: string,
  maxLen: number,
  postCache: Map<string, Promise<ParsedFlarumPost | null>>,
  discussionTitle: string | null | undefined,
): Promise<AnnouncePayload> {
  const profileUrl = forumProfileUrl(authorDisplayName);
  const header = `🔔 Новый комментарий от <b><a href="${escapeHtml(profileUrl)}">${escapeHtml(authorDisplayName)}</a></b>`;
  const titleTrimmed = discussionTitle?.trim();
  const titleLine = titleTrimmed ? `в теме: <b>${escapeHtml(titleTrimmed)}</b>` : "";
  const titleVisibleLen = titleLine ? visibleTextLength(titleLine) : 0;
  const effectiveMaxLen = Math.max(0, maxLen - titleVisibleLen);

  const withImgs = replaceImgTagsWithNumberedAnchors(contentHtml);
  const { guarded, restores } = guardImageAnchorLinks(withImgs);
  const segments = parseBlockquoteSegments(guarded);
  const quoteInners: string[] = [];
  const textParts: string[] = [];
  for (const seg of segments) {
    if (seg.type === "quote") {
      const inner = seg.html.trim();
      if (inner) quoteInners.push(inner);
    } else {
      const t = seg.html.trim();
      if (t) textParts.push(t);
    }
  }
  const mainHtml = textParts.join("\n\n");

  const mentionRestores: string[] = [];
  const mentionPostIds: string[] = [];
  const seenMentionIds = new Set<string>();
  for (const inner of quoteInners) {
    for (const { postId } of postMentionAnchorsFromHtml(inner)) {
      if (seenMentionIds.has(postId)) continue;
      seenMentionIds.add(postId);
      mentionPostIds.push(postId);
    }
  }
  const authorByPostId = await buildQuotePostMentionAuthorMap(mentionPostIds, postCache);

  const quotedBlocks: string[] = [];
  for (const inner of quoteInners) {
    const fromLink = extractReplyAuthorFromQuoteInner(inner);
    const stripped = removeFirstUserProfileLink(inner);
    const base = stripped.length > 0 ? stripped : inner;
    const plainForAuthorInfer = htmlToPlainLines(base);
    let display = fromLink?.display.trim();
    if (!display) {
      display = inferQuotedAuthorFromPlainStart(plainForAuthorInfer) ?? "Пользователь";
    }
    const work = injectQuotePostMentionPlaceholders(base, authorByPostId, mentionRestores);
    const plainWithTokens = htmlToPlainLines(work);
    const plainBody = stripLeadingQuotedAuthorPlain(plainWithTokens, display);
    const nameLine = `<b>${escapeHtml(display)} написал:</b>`;
    const bodyHtml = quoteBodyFromPlainWithPlaceholders(plainBody);
    quotedBlocks.push(`${nameLine}\n${telegramBlockquote(bodyHtml)}`);
  }

  const authorUrl = forumProfileUrl(authorDisplayName);
  let authorReply = "";
  const mainTrim = mainHtml.trim();
  if (mainTrim) {
    const mainFormatted = flarumUserLinksToTelegramMentions(mainTrim);
    const authorVerb = quotedBlocks.length === 0 ? "написал" : "ответил";
    authorReply = `<b><a href="${escapeHtml(authorUrl)}">${escapeHtml(authorDisplayName)}</a> ${authorVerb}:</b>\n${telegramBlockquote(mainFormatted)}`;
  }

  let middle = quotedBlocks.join("\n\n");
  if (middle && authorReply) middle += "\n\n";
  middle += authorReply;

  if (!middle.trim()) {
    return { textHtml: header, imageUrls: [] };
  }

  if (visibleTextLength(middle) > effectiveMaxLen) {
    const plain = stripHtml(withImgs);
    const cap = effectiveMaxLen;
    const truncated = plain.length > cap ? plain.slice(0, cap) + "…" : plain;
    middle = telegramBlockquote(escapeHtml(truncated));
  }

  let full = titleLine ? `${header} ${titleLine}\n\n${middle}` : `${header}\n\n${middle}`;
  full = unguardMentionAnchorLinks(full, mentionRestores);
  full = unguardImageAnchorLinks(full, restores);
  const imageUrls = extractImageUrlsFromAnnouncementHtml(full);
  return { textHtml: full, imageUrls };
}

type BlockSegment = { type: "text" | "quote"; html: string };

/** After `openStart` (index of `<` in `<blockquote`), returns end of matching `</blockquote>` and inner slice end, or null. */
function matchTopLevelBlockquote(
  html: string,
  openStart: number,
): { innerStart: number; innerEnd: number; afterClose: number } | null {
  const tail = html.slice(openStart);
  const openMatch = /^<blockquote\b[^>]*>/i.exec(tail);
  if (!openMatch) return null;
  const innerStart = openStart + openMatch[0].length;
  let depth = 1;
  const re = /<\/?blockquote\b[^>]*>/gi;
  re.lastIndex = innerStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0].toLowerCase();
    if (tag.startsWith("</")) {
      depth--;
      if (depth === 0) {
        return { innerStart, innerEnd: m.index, afterClose: m.index + m[0].length };
      }
    } else {
      depth++;
    }
  }
  return null;
}

/**
 * Splits on **top-level** `<blockquote>…</blockquote>` only (nesting depth), so nested quotes stay in one segment.
 */
function parseBlockquoteSegments(html: string): BlockSegment[] {
  const out: BlockSegment[] = [];
  let pos = 0;
  while (pos < html.length) {
    const rel = html.slice(pos).search(/<blockquote\b/i);
    if (rel === -1) {
      const tail = html.slice(pos);
      if (tail.trim()) out.push({ type: "text", html: tail });
      break;
    }
    const openStart = pos + rel;
    if (openStart > pos) {
      const t = html.slice(pos, openStart);
      if (t.trim()) out.push({ type: "text", html: t });
    }
    const matched = matchTopLevelBlockquote(html, openStart);
    if (!matched) {
      const tail = html.slice(openStart);
      if (tail.trim()) out.push({ type: "text", html: tail });
      break;
    }
    const inner = html.slice(matched.innerStart, matched.innerEnd).trim();
    if (inner) out.push({ type: "quote", html: inner });
    pos = matched.afterClose;
  }
  return out;
}

/** Per-author: list of last seen post IDs (oldest first). At most POSTS_PER_AUTHOR per author. */
const lastSeenByAuthor = new Map<string, string[]>();

const MAX_MESSAGE_LEN = 4096;

async function loadState(path: string): Promise<void> {
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

async function saveState(path: string): Promise<boolean> {
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

const EXBO_FETCH_RETRIES = 2;
const EXBO_FETCH_RETRY_DELAY_MS = 2000;

const EXBO_HTML_LOG_MAX_CHARS = 24_000;

function logExboHtmlDebug(label: string, author: string, postId: string, body: string): void {
  if (LOG_LEVEL !== "info" && LOG_LEVEL !== "debug") return;
  const len = body.length;
  const truncated = len > EXBO_HTML_LOG_MAX_CHARS;
  const text = truncated
    ? `${body.slice(0, EXBO_HTML_LOG_MAX_CHARS)}\n… [truncated ${len - EXBO_HTML_LOG_MAX_CHARS} more chars]`
    : body;
  console.log(
    `[${label}] author=${author} postId=${postId} length=${len}${truncated ? " (truncated in log)" : ""}\n${text}`,
  );
}

async function parseExboPostsResponse(
  data: unknown,
  knownIds: Set<string> | undefined,
  authorDisplayName: string,
  skipSendIfOlderThanMs: number,
): Promise<{ messages: AnnouncePayload[]; newIds: string[] }> {
  if (data === null || typeof data !== "object") return { messages: [], newIds: [] };
  const obj = data as Record<string, unknown>;
  const dataArr = obj.data as unknown[] | undefined;
  const included = (obj.included as unknown[]) ?? [];

  if (!Array.isArray(dataArr) || dataArr.length === 0) return { messages: [], newIds: [] };

  const discussionSlugById = new Map<string, string>();
  const discussionTitleById = new Map<string, string>();
  for (const inc of included) {
    const item = inc as Record<string, unknown>;
    if (item.type === "discussions") {
      const id = item.id as string;
      const attrs = item.attributes as Record<string, unknown> | undefined;
      const slug = (attrs?.slug as string) ?? id;
      discussionSlugById.set(id, String(slug));
      const title = (attrs?.title as string)?.trim();
      if (title) discussionTitleById.set(id, title);
    }
  }

  const messages: AnnouncePayload[] = [];
  const newIds: string[] = [];
  const postMentionCache = new Map<string, Promise<ParsedFlarumPost | null>>();
  const discussionFetchCache = new Map<string, Promise<string | null>>();

  // Oldest first so when we send to the channel, time flow matches reality (old posts appear before new)
  const sorted = [...dataArr].sort((a, b) => {
    const aPost = a as Record<string, unknown>;
    const bPost = b as Record<string, unknown>;
    const aAt = (aPost.attributes as Record<string, unknown>)?.createdAt as string | undefined;
    const bAt = (bPost.attributes as Record<string, unknown>)?.createdAt as string | undefined;
    if (!aAt || !bAt) return 0;
    return new Date(aAt).getTime() - new Date(bAt).getTime();
  });

  for (const post of sorted) {
    const p = post as Record<string, unknown>;
    const postId = String(p.id ?? "");
    if (knownIds?.has(postId)) continue;

    const attrs = (p.attributes as Record<string, unknown>) ?? {};
    const rels = (p.relationships as Record<string, unknown>) ?? {};
    const discussionData = (rels.discussion as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const discussionId = discussionData?.id as string | undefined;
    const slug = discussionId ? (discussionSlugById.get(String(discussionId)) ?? discussionId) : "?";
    const number = (attrs.number as number) ?? "?";
    const createdAt = (attrs.createdAt as string) ?? "";
    const createdAtMs = createdAt ? new Date(createdAt).getTime() : 0;
    const isOld =
      skipSendIfOlderThanMs > 0 && (Number.isNaN(createdAtMs) || Date.now() - createdAtMs > skipSendIfOlderThanMs);
    if (isOld) {
      newIds.push(postId);
      continue;
    }
    let contentHtml = (attrs.contentHtml as string) ?? "";
    contentHtml = await expandPostMentionsInContentHtml(contentHtml, postMentionCache);
    logExboHtmlDebug("Exbo contentHtml", authorDisplayName, postId, contentHtml);
    const link = discussionId ? `${EXBO_FORUM_BASE}/d/${discussionId}-${slug}/${number}` : "";
    const tagLine = telegramHashtagFromAuthor(authorDisplayName);
    const linkAnchor = link ? `<a href="${escapeHtml(link)}">🔗 Ссылка на сообщение</a>` : "";
    const footer = [tagLine, linkAnchor].filter(Boolean).join("\n");
    const discussionTitle = await getDiscussionTitle(discussionId, discussionTitleById, discussionFetchCache);
    let snippetLen = MAX_SNIPPET_LEN;
    let line: string;
    let bodyPayload: AnnouncePayload;
    while (true) {
      bodyPayload = await formatCommentTelegramHtml(
        authorDisplayName,
        contentHtml,
        snippetLen,
        postMentionCache,
        discussionTitle,
      );
      line = footer ? `${bodyPayload.textHtml}\n\n${footer}` : bodyPayload.textHtml;
      if (line.length <= MAX_MESSAGE_LEN || snippetLen <= 0) break;
      snippetLen = Math.max(0, snippetLen - 200);
    }
    logExboHtmlDebug("Telegram formatted", authorDisplayName, postId, line);
    if (line.length <= MAX_MESSAGE_LEN) {
      messages.push({ textHtml: line, imageUrls: bodyPayload.imageUrls });
      newIds.push(postId);
    }
  }

  return { messages, newIds };
}

async function pollExboAndAnnounce(): Promise<void> {
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log("Polling Exbo forum for new posts... ", new Date().toLocaleTimeString());
  }
  for (let i = 0; i < exboAuthors.length; i++) {
    if (i > 0) await sleep(AUTHOR_REQUEST_DELAY_MS);
    const author = exboAuthors[i];
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log(`Polling author '${author}'`);
    }
    try {
      const knownIds = new Set(lastSeenByAuthor.get(author) ?? []);
      const url = getExboPostsUrlForAuthor(author);
      let res: Response | null = null;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= EXBO_FETCH_RETRIES; attempt++) {
        if (attempt > 0) await sleep(EXBO_FETCH_RETRY_DELAY_MS);
        try {
          res = await fetch(url);
          if (res.ok) break;
          lastErr = new Error(`${res.status} ${res.statusText}`);
        } catch (e) {
          lastErr = e;
        }
      }
      if (!res?.ok) {
        console.error("Exbo API request failed for", author, "after retries:", lastErr);
        continue;
      }
      const data = (await res.json()) as unknown;
      const { messages, newIds } = await parseExboPostsResponse(data, knownIds, author, SKIP_SEND_POST_OLDER_THAN_MS);
      // Append in oldest-first order so list stays [oldest, ..., newest] and shift() evicts the oldest
      for (let j = 0; j < newIds.length; j++) {
        const id = newIds[j];
        let list = lastSeenByAuthor.get(author);
        if (!list) {
          list = [];
          lastSeenByAuthor.set(author, list);
        }
        list.push(id);
        while (list.length > POSTS_PER_AUTHOR) list.shift();
      }
      if (messages.length > 0) {
        enqueueTelegramSend(() => sendToTelegramChannels(messages));
      }
      // Persist after each author with new IDs so a crash later in the poll does not drop
      // completed authors from disk (reduces duplicate Telegram risk on restart). Queued sends
      // for this author may still be in flight; a crash right after save can mark seen without delivery.
      if (newIds.length > 0) {
        await saveState(LAST_SEEN_STATE_FILE);
      }
    } catch (err) {
      console.error("Failed to fetch or parse Exbo API for", author, ":", err);
    }
  }
}

let pollIntervalId: ReturnType<typeof setInterval> | undefined;

async function shutdown(): Promise<void> {
  if (pollIntervalId !== undefined) clearInterval(pollIntervalId);
  await flushTelegramSendQueue();
  await saveState(LAST_SEEN_STATE_FILE);
  await bot.stop();
  process.exit(0);
}

const PORT = process.env.PORT;
if (PORT) {
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  }).listen(PORT, () => {
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log("Health check server listening on port", PORT);
    }
  });
}

bot
  .launch(async () => {
    await loadState(LAST_SEEN_STATE_FILE);
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log("Bot started.");
      console.log(
        "Polling Exbo forum every",
        POLL_INTERVAL_MS / 1000,
        "seconds. Sending to",
        chatIds.length,
        "Telegram chat(s).",
      );
    }
    pollExboAndAnnounce();
    pollIntervalId = setInterval(pollExboAndAnnounce, POLL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("Bot failed to start:", err);
    process.exit(1);
  });

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

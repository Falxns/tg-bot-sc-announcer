import "dotenv/config";
import { createServer } from "http";
import { readFile, writeFile } from "fs/promises";
import { Telegraf } from "telegraf";

const EXBO_POSTS_BASE_URL =
  "https://forum.exbo.ru/api/posts?filter%5Btype%5D=comment&page%5Boffset%5D=0&page%5Blimit%5D=5&sort=-createdAt";

const DEFAULT_EXBO_AUTHORS = ["Marxont", "dolgodoomal", "zubzalinaza", "Kommynist", "Mediocree", "ZIV", 
  "Furgon", "pinkDog", "Slyshashchii", "barmeh34", "normist", "_Emelasha_", "ooveronika", "6eximmortal", 
  "AngryKitty", "grin_d", "nastexe", "Erildorian", "litrkerasina", "psychosociaI"];

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
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendToTelegramChannels(messages: string[]): Promise<void> {
  if (messages.length === 0) return;
  const sendOptions = {
    parse_mode: "HTML" as const,
    link_preview_options: { is_disabled: true },
  };
  for (const chatId of chatIds) {
    try {
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
        if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
          console.log("Sending to Telegram chat", chatId, ":", messages[i]);
        }
        try {
          await bot.telegram.sendMessage(chatId, messages[i], sendOptions);
        } catch (sendErr: unknown) {
          const code = (sendErr as { code?: number })?.code;
          if (code === 429) {
            await sleep(5000);
            await bot.telegram.sendMessage(chatId, messages[i], sendOptions);
          } else {
            throw sendErr;
          }
        }
      }
      if (messages.length > 0) await sleep(TELEGRAM_SEND_DELAY_MS);
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

/** Extracts image URLs from <img src="..."> or <img src='...'>. Normalizes (trims) each URL. */
function getImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].replace(/\s+/g, "").trim();
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Returns length of visible text (Telegram formatting tags stripped). */
function visibleTextLength(telegramHtml: string): number {
  return telegramHtml.replace(/<[^>]+>/g, "").length;
}

/**
 * Converts HTML to Telegram-safe HTML with <a> (mention) inner text wrapped in <i>...</i>.
 */
function htmlWithItalicLinks(html: string): string {
  const links: string[] = [];
  const modified = html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, (_, inner) => {
    const text = stripHtml(inner).trim();
    links.push(text ? escapeHtml(text) : "");
    return "\x00L" + (links.length - 1) + "\x00";
  });
  let rich = stripHtml(modified).replace(/\s+/g, " ").trim();
  rich = rich.replace(/\x00L(\d+)\x00/g, (_, i) => "<i>" + links[parseInt(i, 10)] + "</i>");
  const parts = rich.split(/(<i>[\s\S]*?<\/i>)/g);
  return parts.map((p) => (/^<i>/.test(p) ? p : escapeHtml(p))).join("");
}

/**
 * Turns contentHtml into Telegram-safe HTML snippet. Wraps blockquote (quoted reply) in <blockquote>...</blockquote>,
 * and <a> (mention) content in <i>...</i>.
 */
function contentHtmlToSnippetHtml(html: string, maxLen: number): string {
  const blockquoteMatch = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (!blockquoteMatch) {
    const rich = htmlWithItalicLinks(html);
    if (visibleTextLength(rich) > maxLen) {
      const plain = stripHtml(html);
      const truncated = plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
      return escapeHtml(truncated);
    }
    return rich;
  }
  const blockquoteInner = blockquoteMatch[1];
  const rest = html.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/i, " ");
  const richRest = htmlWithItalicLinks(rest);
  const richQuote = htmlWithItalicLinks(blockquoteInner);
  const lenRest = visibleTextLength(richRest);
  const lenQuote = visibleTextLength(richQuote);
  const visibleLen = lenRest + (lenRest && lenQuote ? 1 : 0) + lenQuote;
  if (visibleLen > maxLen) {
    const combinedPlain = [stripHtml(blockquoteInner), stripHtml(rest)].filter(Boolean).join(" ").trim();
    const truncated = combinedPlain.length > maxLen ? combinedPlain.slice(0, maxLen) + "…" : combinedPlain;
    return escapeHtml(truncated);
  }
  if (lenQuote === 0) return richRest;
  if (lenRest === 0) return "<blockquote>" + richQuote + "</blockquote>";
  return "<blockquote>" + richQuote + "</blockquote>" + "\n" + richRest;
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
    if ((err as NodeJS.ErrnoException).code !== "ENOENT" && (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn")) {
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

function parseExboPostsResponse(
  data: unknown,
  knownIds: Set<string> | undefined,
  authorDisplayName: string,
  skipSendIfOlderThanMs: number
): { messages: string[]; newIds: string[] } {
  if (data === null || typeof data !== "object") return { messages: [], newIds: [] };
  const obj = data as Record<string, unknown>;
  const dataArr = obj.data as unknown[] | undefined;
  const included = (obj.included as unknown[]) ?? [];

  if (!Array.isArray(dataArr) || dataArr.length === 0) return { messages: [], newIds: [] };

  const discussionSlugById = new Map<string, string>();
  for (const inc of included) {
    const item = inc as Record<string, unknown>;
    if (item.type === "discussions") {
      const id = item.id as string;
      const attrs = item.attributes as Record<string, unknown> | undefined;
      const slug = (attrs?.slug as string) ?? id;
      discussionSlugById.set(id, String(slug));
    }
  }

  const messages: string[] = [];
  const newIds: string[] = [];
  const baseUrl = "https://forum.exbo.ru";

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
    const slug = discussionId ? discussionSlugById.get(String(discussionId)) ?? discussionId : "?";
    const number = (attrs.number as number) ?? "?";
    const createdAt = (attrs.createdAt as string) ?? "";
    const createdAtMs = createdAt ? new Date(createdAt).getTime() : 0;
    const isOld =
      skipSendIfOlderThanMs > 0 &&
      (Number.isNaN(createdAtMs) || Date.now() - createdAtMs > skipSendIfOlderThanMs);
    if (isOld) {
      newIds.push(postId);
      continue;
    }
    const contentHtml = (attrs.contentHtml as string) ?? "";
    const dateStr = createdAt ? new Date(createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }).replace("T", " ").slice(0, 20) : "";
    const link = discussionId ? `${baseUrl}/d/${discussionId}-${slug}/${number}` : "";
    let snippetLen = MAX_SNIPPET_LEN;
    let line: string;
    while (true) {
      const snippetHtml = contentHtmlToSnippetHtml(contentHtml, snippetLen);
      line = link
        ? `<b>${escapeHtml(authorDisplayName)}</b>\n${dateStr}\n\n${snippetHtml}\n\n${link}`
        : `<b>${escapeHtml(authorDisplayName)}</b>\n${dateStr}\n\n${snippetHtml}`;
      if (line.length <= MAX_MESSAGE_LEN || snippetLen <= 0) break;
      snippetLen = Math.max(0, snippetLen - 200);
    }
    const imageUrls = getImageUrlsFromHtml(contentHtml);
    if (imageUrls.length > 0 && line.length <= MAX_MESSAGE_LEN) {
      const imageLinks = imageUrls
        .map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`)
        .join("\n");
      const imageBlock = "\n\nImage: " + imageLinks;
      if (line.length + imageBlock.length <= MAX_MESSAGE_LEN) line += imageBlock;
    }
    if (line.length <= MAX_MESSAGE_LEN) {
      messages.push(line);
      newIds.push(postId);
    }
  }

  return { messages, newIds };
}

async function pollExboAndAnnounce(): Promise<void> {
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log("Polling Exbo forum for new posts... ", new Date().toLocaleTimeString());
  }
  const allMessages: string[] = [];
  let anyNewIds = false;
  for (let i = 0; i < exboAuthors.length; i++) {
    if (i > 0) await sleep(AUTHOR_REQUEST_DELAY_MS);
    const author = exboAuthors[i];
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
      const { messages, newIds } = parseExboPostsResponse(data, knownIds, author, SKIP_SEND_POST_OLDER_THAN_MS);
      allMessages.push(...messages);
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
        anyNewIds = true;
      }
    } catch (err) {
      console.error("Failed to fetch or parse Exbo API for", author, ":", err);
    }
  }

  if (anyNewIds) {
    await saveState(LAST_SEEN_STATE_FILE);
  }

  if (allMessages.length > 0) {
    await sendToTelegramChannels(allMessages);
  }
}

let pollIntervalId: ReturnType<typeof setInterval> | undefined;

async function shutdown(): Promise<void> {
  if (pollIntervalId !== undefined) clearInterval(pollIntervalId);
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

bot.launch(async () => {
  await loadState(LAST_SEEN_STATE_FILE);
  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log("Bot started.");
    console.log("Polling Exbo forum every", POLL_INTERVAL_MS / 1000, "seconds. Sending to", chatIds.length, "Telegram chat(s).");
  }
  pollExboAndAnnounce();
  pollIntervalId = setInterval(pollExboAndAnnounce, POLL_INTERVAL_MS);
}).catch((err) => {
  console.error("Bot failed to start:", err);
  process.exit(1);
});

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

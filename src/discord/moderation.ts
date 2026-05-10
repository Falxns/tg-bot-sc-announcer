import type { Attachment } from "discord.js";
import { EmbedBuilder, escapeMarkdown, GuildMember, Message } from "discord.js";
import {
  DISCORD_BLOCK_INVITE_LINKS_GLOBAL,
  DISCORD_CHANNEL_POLICIES,
  DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST,
  DISCORD_INVITE_ALLOWED_ROLE_IDS,
  DISCORD_MAJOR_TIMEOUT_LADDER_MS,
  DISCORD_MINOR_TIMEOUT_LADDER_MS,
  DISCORD_MODERATION_DECAY_MS,
  DISCORD_SPAM_FILTER_CHANNEL_IDS,
  DISCORD_WARNING_MESSAGE_TTL_MS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
} from "../config";
import type { DiscordChannelPolicy, ViolationSeverity } from "./types";
import { logModerationEvent } from "./moderationLog";
import {
  applyModerationDecayIfNeeded,
  consumeMajorMuteTierForApply,
  consumeMinorMuteTierForApply,
  getMajorMuteTier,
  getMinorMuteTier,
  incrementMinorWarning,
  saveState,
  touchModerationViolation,
} from "../state";

const MINOR_WARN_THRESHOLD = 3;
/** Discord “red” for moderation user notices */
const MODERATION_USER_EMBED_COLOR = 0xed4245;
const SPAM_DUPLICATE_REASON = "Повтор одного и того же сообщения подряд (спам).";
const SPAM_NORMALIZE_MAX_LEN = 1000;
/** Option F hybrid: max |len(a)−len(b)| for skeleton-based “almost duplicate” (decorated same core). */
const SPAM_HYBRID_MAX_LEN_DELTA = 8;
/** Minimum skeleton length before skeleton equality counts (reduces short false positives). */
const SPAM_SKELETON_MIN_LEN = 4;
/** Option F: fuzzy ratio only when both norms exceed this length (chars). */
const SPAM_FUZZY_LONG_MIN_LEN = 40;
/** Normalized Levenshtein similarity ≥ this ⇒ duplicate for long messages (1 − dist/max(len)). */
const SPAM_FUZZY_MIN_RATIO = 0.92;

type PolicyContext = {
  policy: DiscordChannelPolicy | undefined;
  warningScopeChannelId: string;
  /** Channel where violation occurred (thread or text). */
  sourceChannelId: string;
  parentChannelId: string | undefined;
};

function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function hasExternalInvite(text: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i.test(text);
}

function isDiscordInviteUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i.test(url);
}

function isVideoAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("video/")) return true;
  return /\.(mp4|mov|mkv|webm|avi|wmv)$/i.test(fileName);
}

function isImageAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

function collectSearchableText(message: Message): string {
  const parts: string[] = [message.content];
  for (const e of message.embeds) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    if (e.url) parts.push(e.url);
    if (e.author?.name) parts.push(e.author.name);
    if (e.footer?.text) parts.push(e.footer.text);
    for (const f of e.fields ?? []) {
      if (f.name) parts.push(f.name);
      if (f.value) parts.push(f.value);
    }
  }
  return parts.join("\n");
}

/**
 * Text used only for Discord invite detection. Intentionally excludes embed title/description/footer:
 * rich previews (e.g. YouTube) often repeat the video description, which may contain third-party
 * `discord.gg` links — that would falsely trigger invite moderation while the user only pasted a video URL.
 */
function collectInviteScanText(message: Message): string {
  const parts: string[] = [message.content];
  for (const e of message.embeds) {
    if (e.url) parts.push(e.url);
  }
  return parts.join("\n");
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    let u = m[0];
    u = u.replace(/[).,;]+$/g, "");
    if (u.length > 2) out.push(u);
  }
  return out;
}

function hostMatchesBlacklist(host: string, blacklist: readonly string[]): boolean {
  const h = host.toLowerCase();
  for (const entry of blacklist) {
    if (!entry) continue;
    if (h === entry || h.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/** Strip leading/trailing characters that are not Unicode letters or numbers (decoration / punctuation). */
function stripSpamEdgeNonCore(s: string): string {
  let t = s;
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
  }
  return t;
}

/**
 * Normalize message body for duplicate-spam comparison (same author, consecutive messages).
 * NFKC, zero-width removal, whitespace collapse, lower case, edge stripping; capped length.
 */
function normalizeMessageForSpamCompare(raw: string): string {
  let s = raw.normalize("NFKC");
  s = s.replace(/[\u200B-\u200D\uFEFF\u2060-\u206F]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.toLowerCase();
  s = stripSpamEdgeNonCore(s);
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > SPAM_NORMALIZE_MAX_LEN) s = s.slice(0, SPAM_NORMALIZE_MAX_LEN);
  return s;
}

/** Letters and digits only, order preserved (Option C light) — input must already be normalized. */
function spamSkeleton(normalized: string): string {
  return normalized.replace(/[^\p{L}\p{N}]+/gu, "");
}

function spamNormLengthsClose(a: string, b: string): boolean {
  return Math.abs(a.length - b.length) <= SPAM_HYBRID_MAX_LEN_DELTA;
}

function levenshteinDistance(s: string, t: string): number {
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const v0 = new Array<number>(n + 1);
  const v1 = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

/** 1 − dist/max(len); 0 if edit budget cannot reach SPAM_FUZZY_MIN_RATIO. */
function spamNormalizedLevenshteinSimilarity(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  const maxLen = Math.max(m, n);
  const maxDistForRatio = Math.ceil((1 - SPAM_FUZZY_MIN_RATIO) * maxLen);
  if (Math.abs(m - n) > maxDistForRatio) return 0;
  const d = levenshteinDistance(a, b);
  return 1 - d / maxLen;
}

/**
 * Option F hybrid after Option A normalize: strict equality, or (skeleton + length-close), or long-message fuzzy ratio.
 */
function isSpamDuplicateContentMatch(norm: string, normPrev: string): boolean {
  if (norm === normPrev) return true;

  const sk = spamSkeleton(norm);
  const skPrev = spamSkeleton(normPrev);
  if (
    sk.length >= SPAM_SKELETON_MIN_LEN &&
    skPrev.length >= SPAM_SKELETON_MIN_LEN &&
    sk === skPrev &&
    spamNormLengthsClose(norm, normPrev)
  ) {
    return true;
  }

  if (Math.min(norm.length, normPrev.length) > SPAM_FUZZY_LONG_MIN_LEN) {
    if (spamNormalizedLevenshteinSimilarity(norm, normPrev) >= SPAM_FUZZY_MIN_RATIO) return true;
  }

  return false;
}

function isSpamFilterChannel(ctx: PolicyContext, message: Message): boolean {
  if (DISCORD_SPAM_FILTER_CHANNEL_IDS.size === 0) return false;
  return (
    DISCORD_SPAM_FILTER_CHANNEL_IDS.has(message.channelId) ||
    DISCORD_SPAM_FILTER_CHANNEL_IDS.has(ctx.warningScopeChannelId)
  );
}

/**
 * Same author as immediate previous message in channel + duplicate/near-duplicate body (Option F hybrid) => minor violation.
 * Uses one history fetch; skips if current normalized body is empty.
 */
async function trySpamDuplicateViolation(message: Message): Promise<ViolationHit | null> {
  const norm = normalizeMessageForSpamCompare(message.content);
  if (norm.length === 0) return null;

  const ch = message.channel;
  if (!ch.isTextBased() || !("messages" in ch)) return null;

  let prev: Message | undefined;
  try {
    const coll = await ch.messages.fetch({ limit: 1, before: message.id });
    prev = coll.first();
  } catch {
    return null;
  }
  if (!prev || prev.author.bot || prev.author.id !== message.author.id) return null;

  const normPrev = normalizeMessageForSpamCompare(prev.content);
  if (normPrev.length === 0) return null;
  if (!isSpamDuplicateContentMatch(norm, normPrev)) return null;

  return { severity: "minor", reason: SPAM_DUPLICATE_REASON };
}

function resolvePolicyContext(message: Message): PolicyContext {
  const ch = message.channel;
  const sourceChannelId = message.channelId;
  if (ch.isThread()) {
    const parentId = ch.parentId;
    const warningScopeChannelId = parentId ?? message.channelId;
    const threadPolicy = DISCORD_CHANNEL_POLICIES[message.channelId];
    const parentPolicy = warningScopeChannelId ? DISCORD_CHANNEL_POLICIES[warningScopeChannelId] : undefined;
    return {
      policy: threadPolicy ?? parentPolicy,
      warningScopeChannelId,
      sourceChannelId,
      parentChannelId: parentId ?? undefined,
    };
  }
  return {
    policy: DISCORD_CHANNEL_POLICIES[message.channelId],
    warningScopeChannelId: message.channelId,
    sourceChannelId,
    parentChannelId: undefined,
  };
}

type ViolationHit = { reason: string; severity: ViolationSeverity };

function detectViolations(
  message: Message,
  member: GuildMember,
  ctx: PolicyContext,
  searchable: string,
  inviteScanText: string,
  lowerSearch: string,
  attachments: readonly Attachment[],
): ViolationHit | null {
  const policy = ctx.policy;
  const hits: ViolationHit[] = [];

  const inviteRoleAllow = [...DISCORD_INVITE_ALLOWED_ROLE_IDS, ...(policy?.allowInviteRoleIds ?? [])];
  const allowInvitesInChannel = policy?.allowDiscordInvites === true;
  const shouldCheckInvites =
    !allowInvitesInChannel && (DISCORD_BLOCK_INVITE_LINKS_GLOBAL || policy?.blockInviteLinks === true);
  if (shouldCheckInvites && hasExternalInvite(inviteScanText) && !hasAnyRole(member, inviteRoleAllow)) {
    const sev = policy?.inviteViolationSeverity ?? "major";
    hits.push({ reason: "В этом канале запрещены приглашения Discord.", severity: sev });
  }

  if (DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST.length > 0) {
    for (const url of extractUrls(searchable)) {
      if (isDiscordInviteUrl(url)) continue;
      try {
        const host = new URL(url).hostname.replace(/^\[+|\]+$/g, "").toLowerCase();
        if (hostMatchesBlacklist(host, DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST)) {
          hits.push({ reason: `Ссылка на запрещённый домен: ${host}`, severity: "major" });
          break;
        }
      } catch {
        /* invalid URL */
      }
    }
  }

  if (policy?.blockVideos) {
    const hasVideo = attachments.some((a) => isVideoAttachment(a.contentType, a.name ?? ""));
    if (hasVideo) {
      hits.push({
        reason: "В этом канале запрещены видеовложения.",
        severity: policy.mediaViolationSeverity ?? "minor",
      });
    }
  }
  if (policy?.blockImages) {
    const hasImage = attachments.some((a) => isImageAttachment(a.contentType, a.name ?? ""));
    if (hasImage) {
      hits.push({
        reason: "В этом канале запрещены изображения.",
        severity: policy.mediaViolationSeverity ?? "minor",
      });
    }
  }
  if (policy?.blockText && message.content.trim().length > 0) {
    hits.push({
      reason: "В этом канале запрещены текстовые сообщения.",
      severity: policy.mediaViolationSeverity ?? "minor",
    });
  }
  if (policy?.blockedKeywords && policy.blockedKeywords.length > 0) {
    const hit = policy.blockedKeywords.find((w) => lowerSearch.includes(w));
    if (hit) {
      hits.push({
        reason: `Обнаружено запрещённое слово: «${hit}».`,
        severity: policy.keywordViolationSeverity ?? "minor",
      });
    }
  }

  if (hits.length === 0) return null;
  const major = hits.find((h) => h.severity === "major");
  return major ?? hits[0];
}

function moderationLogUserLabel(member: GuildMember, author: Message["author"]): string {
  const display = member.displayName?.trim();
  if (display && display.length > 0) return display.replace(/\s+/g, " ").slice(0, 64);
  const username = (author.globalName ?? author.username)?.trim();
  if (username && username.length > 0) return username.replace(/\s+/g, " ").slice(0, 64);
  return author.id;
}

function moderationLogChannelLabel(message: Message): string {
  const ch = message.channel;
  if (ch && typeof ch === "object" && "name" in ch && typeof (ch as { name?: string }).name === "string") {
    const name = (ch as { name: string }).name.trim();
    if (name.length > 0) return name.replace(/\s+/g, " ").slice(0, 80);
  }
  return message.channelId;
}

async function deleteLater(message: Message, delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  setTimeout(() => {
    void message.delete().catch(() => undefined);
  }, delayMs);
}

function formatDurationRu(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} мин.`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin < 1440) return m > 0 ? `${h} ч ${m} мин.` : `${h} ч`;
  const d = Math.floor(totalMin / 1440);
  const remH = Math.floor((totalMin % 1440) / 60);
  return remH > 0 ? `${d} д ${remH} ч` : `${d} д`;
}

/** Prefer human-readable channel/thread name; fetch if missing from cache. */
async function resolveModerationChannelName(message: Message): Promise<string> {
  const ch = message.channel;
  if (ch && typeof ch === "object" && "name" in ch && typeof (ch as { name?: string }).name === "string") {
    const n = (ch as { name: string }).name.trim();
    if (n.length > 0) return n.slice(0, 100);
  }
  const cid = message.channelId;
  try {
    const fetched = await message.client.channels.fetch(cid);
    if (fetched && "name" in fetched && typeof (fetched as { name?: string }).name === "string") {
      const n = (fetched as { name: string }).name.trim();
      if (n.length > 0) return n.slice(0, 100);
    }
  } catch {
    /* use id fallback */
  }
  return cid;
}

type ModerationUserNotice =
  | {
      kind: "minor";
      reason: string;
      warnCount: number;
      timeoutMs?: number;
    }
  | {
      kind: "major";
      reason: string;
      outcome: "applied" | "api_error" | "not_moderatable";
      timeoutMs?: number;
    };

async function buildModerationUserNoticeEmbed(
  message: Message,
  member: GuildMember,
  notice: ModerationUserNotice,
): Promise<EmbedBuilder> {
  const guild = message.guild;
  const guildName = (guild?.name ?? "Сервер").trim() || "Сервер";
  const channelName = await resolveModerationChannelName(message);
  const nick = (member.displayName ?? member.user.username).trim() || member.user.username;
  const userId = member.id;

  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(`**Сервер:** **${escapeMarkdown(guildName)}**`);
  lines.push(`**Канал:** **${escapeMarkdown(channelName)}**`);
  lines.push(`**Ник на сервере:** **${escapeMarkdown(nick)}**`);
  lines.push("");
  lines.push(`**Причина**`);
  lines.push(escapeMarkdown(notice.reason));

  if (notice.kind === "minor") {
    lines.push("");
    lines.push(
      `**Предупреждения в этом канале:** **${notice.warnCount}** (порог таймаута: **${MINOR_WARN_THRESHOLD}**).`,
    );
    if (notice.timeoutMs !== undefined) {
      lines.push("");
      lines.push(`**Таймаут:** **${escapeMarkdown(formatDurationRu(notice.timeoutMs))}**`);
    }
  } else {
    lines.push("");
    if (notice.outcome === "applied" && notice.timeoutMs !== undefined) {
      lines.push(`**Таймаут:** **${escapeMarkdown(formatDurationRu(notice.timeoutMs))}**`);
    } else if (notice.outcome === "api_error") {
      lines.push("**Таймаут:** не удалось применить (ошибка Discord API).");
    } else {
      lines.push(
        "**Таймаут:** не применён — бот не может замутить этого пользователя (проверьте иерархию ролей).",
      );
    }
  }

  const title = notice.kind === "major" ? "Серьёзное нарушение" : "Предупреждение";
  const description = lines.join("\n").slice(0, 4096);

  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: "Автоматическая модерация" });
}

async function notifyUserModerationEmbed(message: Message, member: GuildMember, embed: EmbedBuilder): Promise<void> {
  try {
    await member.send({ embeds: [embed] });
  } catch {
    const ch = message.channel;
    if (ch.isTextBased() && "send" in ch) {
      const notice = await ch.send({ embeds: [embed] }).catch(() => null);
      if (notice) await deleteLater(notice, DISCORD_WARNING_MESSAGE_TTL_MS);
    }
  }
}

export async function handleModerationMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  if (message.author.bot || message.system) return;
  const member = message.member;
  if (!(member instanceof GuildMember)) return;

  const ctx = resolvePolicyContext(message);
  const searchable = collectSearchableText(message);
  const inviteScanText = collectInviteScanText(message);
  const lowerSearch = searchable.toLowerCase();
  const attachments = [...message.attachments.values()];

  let violation: ViolationHit | null = null;
  if (isSpamFilterChannel(ctx, message)) {
    violation = await trySpamDuplicateViolation(message);
  }
  if (!violation) {
    violation = detectViolations(message, member, ctx, searchable, inviteScanText, lowerSearch, attachments);
  }
  if (!violation) return;

  const guildId = message.guildId;
  const userId = message.author.id;
  const now = Date.now();
  applyModerationDecayIfNeeded(guildId, userId, now, DISCORD_MODERATION_DECAY_MS);

  const excerpt = `${message.content}`.slice(0, 400);
  const msgId = message.id;

  try {
    await message.delete();
  } catch (err) {
    console.error("Discord moderation failed to delete message:", err);
    return;
  }

  touchModerationViolation(guildId, userId, now);

  if (violation.severity === "major") {
    const lastIdx = DISCORD_MAJOR_TIMEOUT_LADDER_MS.length - 1;
    const tierBefore = getMajorMuteTier(guildId, userId);
    const idx = Math.min(tierBefore, lastIdx);
    const ms = DISCORD_MAJOR_TIMEOUT_LADDER_MS[idx] ?? DISCORD_MAJOR_TIMEOUT_LADDER_MS[lastIdx];
    let tierAfter = tierBefore;
    let majorTimeoutApplied = false;
    if (member.moderatable) {
      try {
        await member.timeout(ms, `Автомодерация (major): ${violation.reason}`.slice(0, 500));
        consumeMajorMuteTierForApply(guildId, userId, lastIdx);
        tierAfter = getMajorMuteTier(guildId, userId);
        majorTimeoutApplied = true;
      } catch (err) {
        console.error("Discord major moderation timeout failed:", err);
      }
    }

    await saveState(LAST_SEEN_STATE_FILE);

    await logModerationEvent(message.guild!, {
      title: "Major: таймаут",
      color: 0xcc3333,
      targetUserId: userId,
      channelId: ctx.sourceChannelId,
      parentChannelId: ctx.parentChannelId,
      reason: violation.reason,
      severity: "major",
      majorMuteTierBefore: tierBefore,
      majorMuteTierAfter: tierAfter,
      timeoutMs: ms,
      messageId: msgId,
      messageExcerpt: excerpt,
    });

    const majorOutcome = majorTimeoutApplied ? "applied" : member.moderatable ? "api_error" : "not_moderatable";
    const majorEmbed = await buildModerationUserNoticeEmbed(message, member, {
      kind: "major",
      reason: violation.reason,
      outcome: majorOutcome,
      timeoutMs: majorTimeoutApplied ? ms : undefined,
    });
    await notifyUserModerationEmbed(message, member, majorEmbed);

    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      const userLabel = moderationLogUserLabel(member, message.author);
      const channelLabel = moderationLogChannelLabel(message);
      console.log(
        `[Discord moderation major] user=${userId} (${userLabel}) channel=${message.channelId} (${channelLabel}) reason=${violation.reason} tier=${tierBefore}->${tierAfter}`,
      );
    }
    return;
  }

  const warnCount = incrementMinorWarning(guildId, ctx.warningScopeChannelId, userId);
  const lastMinorIdx = DISCORD_MINOR_TIMEOUT_LADDER_MS.length - 1;
  let timeoutMs: number | undefined;
  const tierMinorBefore = getMinorMuteTier(guildId, userId);
  let tierMinorAfter = tierMinorBefore;

  if (warnCount >= MINOR_WARN_THRESHOLD && member.moderatable) {
    const tb = getMinorMuteTier(guildId, userId);
    const idx = Math.min(tb, lastMinorIdx);
    const ms = DISCORD_MINOR_TIMEOUT_LADDER_MS[idx] ?? DISCORD_MINOR_TIMEOUT_LADDER_MS[lastMinorIdx];
    try {
      await member.timeout(ms, `Автомодерация (minor): ${violation.reason}`.slice(0, 500));
      consumeMinorMuteTierForApply(guildId, userId, lastMinorIdx);
      tierMinorAfter = getMinorMuteTier(guildId, userId);
      timeoutMs = ms;
    } catch (err) {
      console.error("Discord minor moderation timeout failed:", err);
    }
  }

  await saveState(LAST_SEEN_STATE_FILE);

  const minorEmbed = await buildModerationUserNoticeEmbed(message, member, {
    kind: "minor",
    reason: violation.reason,
    warnCount,
    timeoutMs,
  });
  await notifyUserModerationEmbed(message, member, minorEmbed);

  await logModerationEvent(message.guild!, {
    title: timeoutMs !== undefined ? "Minor: предупреждение + таймаут" : "Minor: предупреждение",
    color: timeoutMs !== undefined ? 0xcc8833 : 0x3388cc,
    targetUserId: userId,
    channelId: ctx.sourceChannelId,
    parentChannelId: ctx.parentChannelId,
    reason: violation.reason,
    severity: "minor",
    minorWarningsInChannel: warnCount,
    minorMuteTierBefore: tierMinorBefore,
    minorMuteTierAfter: tierMinorAfter,
    timeoutMs,
    messageId: msgId,
    messageExcerpt: excerpt,
  });

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    const userLabel = moderationLogUserLabel(member, message.author);
    const channelLabel = moderationLogChannelLabel(message);
    console.log(
      `[Discord moderation minor] user=${userId} (${userLabel}) channel=${message.channelId} (${channelLabel}) reason=${violation.reason} warnings=${warnCount} minorTier=${tierMinorBefore}->${tierMinorAfter}`,
    );
  }
}

import type { Attachment } from "discord.js";
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  escapeMarkdown,
  Guild,
  GuildMember,
  Message,
  User,
} from "discord.js";
import {
  DISCORD_BLOCK_INVITE_LINKS_GLOBAL,
  DISCORD_CHANNEL_POLICIES,
  DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST,
  DISCORD_INVITE_ALLOWED_ROLE_IDS,
  DISCORD_MODERATION_DECAY_MS,
  DISCORD_SPAM_FILTER_CHANNEL_IDS,
  DISCORD_WARNING_MESSAGE_TTL_MS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  resolveSpamFilterChannelOptions,
} from "../config";
import type { DiscordChannelPolicy, ViolationSeverity } from "./types";
import { logModerationEvent } from "./moderationLog";
import {
  appendResolvedNoticeLines,
  moderationLogNoticePayload,
  resolveModerationNotice,
  type ModerationNoticeEmbedLabels,
  type ResolvedModerationNotice,
} from "./moderationNotice";
import { formatChannelLineForEmbed } from "./moderationReasonPresets";
import { AUTOMOD_RULE_PRESET_IDS } from "./moderationRulePresets";
import {
  discordAutoMod as autoTxt,
  discordFormatDurationRu,
  discordModerationCommands as modTxt,
  discordModerationLogTitles as logTitles,
} from "./userStrings";
import { evictMessageReviewCache } from "./messageReview";
import { isModerationProtectedTarget } from "./guildPermissions";
import { applyLightModerationSanction, applyMajorModerationSanction } from "./moderationSanction";
import {
  hasCrossAuthorSpamDuplicate,
  recordSpamFilterFingerprint,
} from "./spamFilterCache";
import {
  buildSpamFingerprint,
  isSpamDuplicateContentMatch,
  normalizeMessageForSpamCompare,
} from "./spamFilterCompare";
import {
  applyModerationDecayIfNeeded,
  getMuteTier,
  saveState,
  touchModerationViolation,
} from "../state";

/** Discord “red” for moderation user notices */
const MODERATION_USER_EMBED_COLOR = 0xed4245;
const SPAM_DUPLICATE_REASON = autoTxt.spamDuplicateReason;
const SPAM_CROSS_AUTHOR_COOLDOWN_REASON = autoTxt.spamCrossAuthorCooldownReason;

const AUTO_NOTICE_LABELS: ModerationNoticeEmbedLabels = {
  reason: autoTxt.labelReason,
  channelViolation: autoTxt.labelChannelViolation,
  ruleServer: autoTxt.labelRuleServer,
};

const STAFF_NOTICE_LABELS: ModerationNoticeEmbedLabels = {
  reason: modTxt.staffDmLabelReason,
  channelViolation: modTxt.staffDmLabelChannelViolation,
  ruleServer: modTxt.staffDmLabelRuleServer,
};

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

function isSpamFilterChannel(ctx: PolicyContext, message: Message): boolean {
  if (DISCORD_SPAM_FILTER_CHANNEL_IDS.size === 0) return false;
  return (
    DISCORD_SPAM_FILTER_CHANNEL_IDS.has(message.channelId) ||
    DISCORD_SPAM_FILTER_CHANNEL_IDS.has(ctx.warningScopeChannelId)
  );
}

function trySpamCrossAuthorCooldownViolation(message: Message, ctx: PolicyContext): ViolationHit | null {
  const { norm } = buildSpamFingerprint(message.content);
  if (norm.length === 0) return null;
  if (hasCrossAuthorSpamDuplicate(ctx.warningScopeChannelId, norm)) {
    return {
      severity: "minor",
      logReason: SPAM_CROSS_AUTHOR_COOLDOWN_REASON,
      rulePresetId: AUTOMOD_RULE_PRESET_IDS.recruitSpam,
      fallbackUserReason: SPAM_CROSS_AUTHOR_COOLDOWN_REASON,
    };
  }
  return null;
}

/**
 * Same author as immediate previous message in channel + duplicate/near-duplicate body (Option F hybrid) => minor violation.
 * Uses one history fetch; skips if current normalized body is empty.
 */
async function trySpamSameAuthorConsecutiveViolation(message: Message): Promise<ViolationHit | null> {
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

  return {
    severity: "minor",
    logReason: SPAM_DUPLICATE_REASON,
    rulePresetId: AUTOMOD_RULE_PRESET_IDS.spam,
    fallbackUserReason: SPAM_DUPLICATE_REASON,
  };
}

async function trySpamDuplicateViolation(message: Message, ctx: PolicyContext): Promise<ViolationHit | null> {
  const opts = resolveSpamFilterChannelOptions(message.channelId, ctx.warningScopeChannelId);
  if (opts?.crossAuthor) {
    return trySpamCrossAuthorCooldownViolation(message, ctx);
  }
  return trySpamSameAuthorConsecutiveViolation(message);
}

function maybeRecordSpamFilterFingerprint(message: Message, ctx: PolicyContext): void {
  if (!isSpamFilterChannel(ctx, message)) return;
  const opts = resolveSpamFilterChannelOptions(message.channelId, ctx.warningScopeChannelId);
  if (!opts?.crossAuthor) return;
  const { norm, skeleton } = buildSpamFingerprint(message.content);
  if (norm.length === 0) return;
  recordSpamFilterFingerprint(ctx.warningScopeChannelId, norm, skeleton, message.author.id);
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

type ViolationHit = {
  /** Automod audit reason for mod log (short technical line). */
  logReason: string;
  severity: ViolationSeverity;
  /** Use channel-purpose text from policy.channelPresetId when set. */
  useChannelPurposeText?: boolean;
  /** Rule preset for user DM (detector default or policy.rulePresetId). */
  rulePresetId?: string;
  /** User-facing fallback when no channel/rule preset text applies. */
  fallbackUserReason: string;
};

function buildAutomodUserNotice(
  policy: DiscordChannelPolicy | undefined,
  scopeChannelId: string,
  hit: ViolationHit,
): ResolvedModerationNotice {
  return resolveModerationNotice({
    channelPresetId: hit.useChannelPurposeText ? policy?.channelPresetId : undefined,
    rulePresetId: hit.rulePresetId ?? policy?.rulePresetId,
    scopeChannelId,
    defaultReason: hit.fallbackUserReason,
  });
}

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
    hits.push({
      logReason: autoTxt.invitesForbidden,
      severity: sev,
      rulePresetId: AUTOMOD_RULE_PRESET_IDS.invites,
      fallbackUserReason: autoTxt.invitesForbidden,
    });
  }

  if (DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST.length > 0) {
    for (const url of extractUrls(searchable)) {
      if (isDiscordInviteUrl(url)) continue;
      try {
        const host = new URL(url).hostname.replace(/^\[+|\]+$/g, "").toLowerCase();
        if (hostMatchesBlacklist(host, DISCORD_EXTERNAL_LINK_DOMAIN_BLACKLIST)) {
          hits.push({
            logReason: autoTxt.forbiddenDomain(host),
            severity: "major",
            rulePresetId: AUTOMOD_RULE_PRESET_IDS.forbiddenDomain,
            fallbackUserReason: autoTxt.forbiddenDomain(host),
          });
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
      const logReason = autoTxt.videoForbidden;
      hits.push({
        logReason,
        severity: policy.mediaViolationSeverity ?? "minor",
        useChannelPurposeText: true,
        fallbackUserReason: logReason,
      });
    }
  }
  if (policy?.blockImages) {
    const hasImage = attachments.some((a) => isImageAttachment(a.contentType, a.name ?? ""));
    if (hasImage) {
      const logReason = autoTxt.imageForbidden;
      hits.push({
        logReason,
        severity: policy.mediaViolationSeverity ?? "minor",
        useChannelPurposeText: true,
        fallbackUserReason: logReason,
      });
    }
  }
  if (policy?.blockText && message.content.trim().length > 0) {
    const logReason = autoTxt.textForbidden;
    hits.push({
      logReason,
      severity: policy.mediaViolationSeverity ?? "minor",
      useChannelPurposeText: true,
      fallbackUserReason: logReason,
    });
  }
  if (policy?.blockedKeywords && policy.blockedKeywords.length > 0) {
    const hit = policy.blockedKeywords.find((w) => lowerSearch.includes(w));
    if (hit) {
      const logReason = autoTxt.keywordHit(hit);
      hits.push({
        logReason,
        severity: policy.keywordViolationSeverity ?? "minor",
        useChannelPurposeText: true,
        fallbackUserReason: logReason,
      });
    }
  }

  if (hits.length === 0) return null;
  const major = hits.find((h) => h.severity === "major");
  return major ?? hits[0];
}

function moderationEmbedChannelId(message: Message): string {
  const ch = message.channel;
  if (ch && "isThread" in ch && ch.isThread() && ch.parentId) return ch.parentId;
  return message.channelId;
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

/** Light automod strike: delete source message, +1 warn, optional ladder timeout, DM + mod log. */
export async function applyLightStrikeForMessage(
  message: Message,
  member: GuildMember,
  reason: string,
  logTitle: string,
): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  const guildId = guild.id;
  const userId = message.author.id;
  const now = Date.now();
  const excerpt = message.content.slice(0, 400);
  const ctx = resolvePolicyContext(message);

  applyModerationDecayIfNeeded(guildId, userId, now, DISCORD_MODERATION_DECAY_MS);

  try {
    evictMessageReviewCache(message.id);
    await message.delete();
  } catch (err) {
    console.error("Light strike failed to delete message:", err);
    return;
  }

  touchModerationViolation(guildId, userId, now);

  const userNotice = resolveModerationNotice({
    custom: reason,
    defaultReason: reason,
    scopeChannelId: ctx.warningScopeChannelId,
    channelPresetId: ctx.policy?.channelPresetId,
    rulePresetId: ctx.policy?.rulePresetId,
  });

  const light = await applyLightModerationSanction({
    guildId,
    userId,
    member,
    reason: userNotice.combinedReason,
  });
  const timeoutMs = light.timeoutApplied ? light.timeoutMs : undefined;

  await saveState(LAST_SEEN_STATE_FILE);

  const minorEmbed = await buildModerationUserNoticeEmbed(message, member, {
    kind: "minor",
    resolved: userNotice,
    timeoutMs,
  });
  await notifyUserModerationEmbed(message, member, minorEmbed);

  await logModerationEvent(guild, {
    title: logTitle,
    color: timeoutMs !== undefined ? 0xcc8833 : 0x3388cc,
    targetUserId: userId,
    channelId: ctx.sourceChannelId,
    parentChannelId: ctx.parentChannelId,
    reason: userNotice.combinedReason,
    minorWarningsInChannel: light.warnCount,
    timeoutMs,
    messageExcerpt: excerpt,
  });
}

/** Reply in channel/thread, then delete the bot message after TTL. */
export async function replyInChannelAutoDelete(
  message: Message,
  content: string,
  options?: { deleteUserMessage?: boolean },
): Promise<void> {
  const reply = await message.reply({ content, allowedMentions: { parse: [] } }).catch(() => null);
  if (reply) await deleteLater(reply, DISCORD_WARNING_MESSAGE_TTL_MS);
  if (options?.deleteUserMessage) {
    evictMessageReviewCache(message.id);
    await deleteLater(message, DISCORD_WARNING_MESSAGE_TTL_MS);
  }
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
      resolved: ResolvedModerationNotice;
      timeoutMs?: number;
    }
  | {
      kind: "major";
      resolved: ResolvedModerationNotice;
      outcome: "applied" | "api_error" | "not_moderatable";
      timeoutMs?: number;
    };

async function buildModerationUserNoticeEmbed(
  message: Message,
  member: GuildMember,
  notice: ModerationUserNotice,
): Promise<EmbedBuilder> {
  const channelId = moderationEmbedChannelId(message);
  const userId = member.id;

  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(channelId, autoTxt.labelChannel));
  lines.push("");
  appendResolvedNoticeLines(lines, notice.resolved, AUTO_NOTICE_LABELS);

  if (notice.kind === "minor") {
    if (notice.timeoutMs !== undefined) {
      lines.push("");
      lines.push(`**${autoTxt.labelTimeout}:** **${escapeMarkdown(discordFormatDurationRu(notice.timeoutMs))}**`);
    }
  } else {
    lines.push("");
    if (notice.outcome === "applied" && notice.timeoutMs !== undefined) {
      lines.push(`**${autoTxt.labelTimeout}:** **${escapeMarkdown(discordFormatDurationRu(notice.timeoutMs))}**`);
    } else if (notice.outcome === "api_error") {
      lines.push(autoTxt.timeoutApplyFail);
    } else {
      lines.push(autoTxt.timeoutNotModeratable);
    }
  }

  const title = notice.kind === "major" ? autoTxt.titleMajor : autoTxt.titleMinor;
  const description = lines.join("\n").slice(0, 4096);

  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: autoTxt.embedFooter });
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

/** DM (+ ephemeral fallback to command channel) for manual `/mute`, `/strike`, `/unmute` — mirrors {@link notifyUserModerationEmbed}. */
export async function notifyStaffModerationUser(
  interaction: ChatInputCommandInteraction,
  member: GuildMember,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    await member.send({ embeds: [embed] });
  } catch {
    const ch = interaction.channel;
    if (ch?.isTextBased() && "send" in ch) {
      const notice = await ch.send({ embeds: [embed] }).catch(() => null);
      if (notice) await deleteLater(notice, DISCORD_WARNING_MESSAGE_TTL_MS);
    }
  }
}

/** DM (+ ephemeral fallback to command channel) for `/ban` / `/unban` when the target may not be a guild member. */
export async function notifyStaffUserDmFallback(
  interaction: ChatInputCommandInteraction,
  user: User,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    await user.send({ embeds: [embed] });
  } catch {
    const ch = interaction.channel;
    if (ch?.isTextBased() && "send" in ch) {
      const notice = await ch.send({ embeds: [embed] }).catch(() => null);
      if (notice) await deleteLater(notice, DISCORD_WARNING_MESSAGE_TTL_MS);
    }
  }
}

export function buildStaffManualMuteEmbed(opts: {
  guild: Guild;
  member: GuildMember;
  channelId: string;
  notice: ResolvedModerationNotice;
  timeoutMs: number;
}): EmbedBuilder {
  const userId = opts.member.id;
  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(opts.channelId, autoTxt.labelChannel));
  lines.push("");
  appendResolvedNoticeLines(lines, opts.notice, STAFF_NOTICE_LABELS);
  lines.push("");
  lines.push(`**${autoTxt.labelTimeout}:** **${escapeMarkdown(discordFormatDurationRu(opts.timeoutMs))}**`);
  const description = lines.join("\n").slice(0, 4096);
  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(modTxt.staffDmTitleMute)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: modTxt.staffDmFooter });
}

export function buildStaffManualStrikeEmbed(opts: {
  guild: Guild;
  member: GuildMember;
  channelId: string;
  notice: ResolvedModerationNotice;
  timeoutMs?: number;
}): EmbedBuilder {
  const userId = opts.member.id;
  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(opts.channelId, autoTxt.labelChannel));
  lines.push("");
  appendResolvedNoticeLines(lines, opts.notice, STAFF_NOTICE_LABELS);
  if (opts.timeoutMs !== undefined) {
    lines.push("");
    lines.push(`**${autoTxt.labelTimeout}:** **${escapeMarkdown(discordFormatDurationRu(opts.timeoutMs))}**`);
  }
  const title =
    opts.timeoutMs !== undefined ? modTxt.staffDmTitleStrikePunishment : modTxt.staffDmTitleStrikeWarn;
  const description = lines.join("\n").slice(0, 4096);
  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: modTxt.staffDmFooter });
}

export function buildStaffManualUnmuteEmbed(opts: {
  guild: Guild;
  member: GuildMember;
  channelId: string;
}): EmbedBuilder {
  const userId = opts.member.id;
  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(opts.channelId, autoTxt.labelChannel));
  lines.push("");
  lines.push(escapeMarkdown(modTxt.staffDmUnmuteBody));
  const description = lines.join("\n").slice(0, 4096);
  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(modTxt.staffDmTitleUnmute)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: modTxt.staffDmFooter });
}

export function buildStaffManualBanEmbed(opts: {
  guild: Guild;
  targetUser: User;
  member: GuildMember | null;
  channelId: string;
  notice: ResolvedModerationNotice;
}): EmbedBuilder {
  const userId = opts.targetUser.id;
  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(opts.channelId, autoTxt.labelChannel));
  lines.push("");
  appendResolvedNoticeLines(lines, opts.notice, STAFF_NOTICE_LABELS);
  lines.push("");
  lines.push(escapeMarkdown(modTxt.staffDmBanPermanentLine));
  const description = lines.join("\n").slice(0, 4096);
  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(modTxt.staffDmTitleBan)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: modTxt.staffDmFooter });
}

export function buildStaffManualUnbanEmbed(opts: {
  guild: Guild;
  user: User;
  channelId: string;
}): EmbedBuilder {
  const userId = opts.user.id;
  const lines: string[] = [`<@${userId}>`, ""];
  lines.push(formatChannelLineForEmbed(opts.channelId, autoTxt.labelChannel));
  lines.push("");
  lines.push(escapeMarkdown(modTxt.staffDmUnbanFromServerBody));
  const description = lines.join("\n").slice(0, 4096);
  return new EmbedBuilder()
    .setColor(MODERATION_USER_EMBED_COLOR)
    .setTitle(modTxt.staffDmTitleUnbanFromServer)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: modTxt.staffDmFooter });
}

export async function handleModerationMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  if (message.author.bot || message.system) return;
  const member = message.member;
  if (!(member instanceof GuildMember)) return;
  if (isModerationProtectedTarget(member)) return;

  const ctx = resolvePolicyContext(message);
  const searchable = collectSearchableText(message);
  const inviteScanText = collectInviteScanText(message);
  const lowerSearch = searchable.toLowerCase();
  const attachments = [...message.attachments.values()];

  let violation: ViolationHit | null = null;
  if (isSpamFilterChannel(ctx, message)) {
    violation = await trySpamDuplicateViolation(message, ctx);
  }
  if (!violation) {
    violation = detectViolations(message, member, ctx, searchable, inviteScanText, lowerSearch, attachments);
  }
  if (!violation) {
    maybeRecordSpamFilterFingerprint(message, ctx);
    return;
  }

  const guildId = message.guildId;
  const userId = message.author.id;
  const now = Date.now();
  applyModerationDecayIfNeeded(guildId, userId, now, DISCORD_MODERATION_DECAY_MS);

  const excerpt = `${message.content}`.slice(0, 400);

  evictMessageReviewCache(message.id);

  try {
    await message.delete();
  } catch (err) {
    console.error("Discord moderation failed to delete message:", err);
    return;
  }

  touchModerationViolation(guildId, userId, now);

  const userNotice = buildAutomodUserNotice(ctx.policy, ctx.warningScopeChannelId, violation);

  if (violation.severity === "major") {
    const tierBefore = getMuteTier(guildId, userId);
    const major = await applyMajorModerationSanction({
      guildId,
      userId,
      member,
      reason: userNotice.combinedReason,
    });

    await saveState(LAST_SEEN_STATE_FILE);

    await logModerationEvent(message.guild!, {
      title: logTitles.majorTimeout,
      color: 0xcc3333,
      targetUserId: userId,
      channelId: ctx.sourceChannelId,
      parentChannelId: ctx.parentChannelId,
      minorWarningsInChannel: major.warnCount,
      timeoutMs: major.timeout.timeoutMs,
      messageExcerpt: excerpt,
      ...moderationLogNoticePayload(userNotice, { automodReason: violation.logReason }),
    });

    const majorOutcome = major.timeout.outcome;
    const majorEmbed = await buildModerationUserNoticeEmbed(message, member, {
      kind: "major",
      resolved: userNotice,
      outcome: majorOutcome,
      timeoutMs: major.timeout.timeoutMs,
    });
    await notifyUserModerationEmbed(message, member, majorEmbed);

    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      const userLabel = moderationLogUserLabel(member, message.author);
      const channelLabel = moderationLogChannelLabel(message);
      console.log(
        `[Discord moderation major] user=${userId} (${userLabel}) channel=${message.channelId} (${channelLabel}) reason=${violation.logReason} tier=${tierBefore}->${major.plan.tierAfter}`,
      );
    }
    return;
  }

  const tierBefore = getMuteTier(guildId, userId);
  const light = await applyLightModerationSanction({
    guildId,
    userId,
    member,
    reason: userNotice.combinedReason,
  });
  const timeoutMs = light.timeoutApplied ? light.timeoutMs : undefined;
  const tierAfter = getMuteTier(guildId, userId);

  await saveState(LAST_SEEN_STATE_FILE);

  const minorEmbed = await buildModerationUserNoticeEmbed(message, member, {
    kind: "minor",
    resolved: userNotice,
    timeoutMs,
  });
  await notifyUserModerationEmbed(message, member, minorEmbed);

  await logModerationEvent(message.guild!, {
    title: timeoutMs !== undefined ? logTitles.minorWarnTimeout : logTitles.minorWarnOnly,
    color: timeoutMs !== undefined ? 0xcc8833 : 0x3388cc,
    targetUserId: userId,
    channelId: ctx.sourceChannelId,
    parentChannelId: ctx.parentChannelId,
    minorWarningsInChannel: light.warnCount,
    timeoutMs,
    messageExcerpt: excerpt,
    ...moderationLogNoticePayload(userNotice, { automodReason: violation.logReason }),
  });

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    const userLabel = moderationLogUserLabel(member, message.author);
    const channelLabel = moderationLogChannelLabel(message);
    console.log(
      `[Discord moderation light] user=${userId} (${userLabel}) channel=${message.channelId} (${channelLabel}) reason=${violation.logReason} warnings=${light.warnCount} tier=${tierBefore}->${tierAfter}`,
    );
  }
}

import { GuildMember, Message, PartialMessage } from "discord.js";
import {
  DISCORD_CLAN_AD_FORMAT_CHANNELS,
  DISCORD_CLAN_AD_FORMAT_GRACE_MS,
  DISCORD_CLAN_AD_FORMAT_PIN_URLS,
  DISCORD_CLAN_RECRUIT_CHANNEL_ID,
  DISCORD_DEV_MODE,
  DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS,
  DISCORD_WARNING_MESSAGE_TTL_MS,
  LOG_LEVEL,
  type ClanAdFormatId,
} from "../config";
import { isDiscordAdmin, isDiscordModerator, isModerationProtectedTarget } from "./guildPermissions";
import { discordClanAdFormat as fmtTxt } from "./userStrings";

export type ClanAdValidationError =
  | { code: "missing_section"; section: number; blockIndex?: number }
  | { code: "empty_required"; section: number; blockIndex?: number }
  | { code: "invalid_enum"; section: number; blockIndex?: number }
  | { code: "invalid_block_count"; expected: "1-3" | "1"; got: number }
  | { code: "missing_attachment" };

type ParsedSection = { number: number; value: string };

type ClanAdPendingReview = {
  messageId: string;
  guildId: string;
  channelId: string;
  authorId: string;
  formatId: ClanAdFormatId;
  deadlineMs: number;
  timeoutId?: ReturnType<typeof setTimeout>;
};

const pendingClanAds = new Map<string, ClanAdPendingReview>();

/** Line-start headers only; `.` must not start a decimal (e.g. K/D line `1.2`). Trailing ws after delimiter must not swallow the next line. */
const SECTION_HEADER_RE = /(?:^|\n)\s*(\d{1,2})\s*(?:\)|\.(?!\d)|:|[-–—])[^\S\n]*/g;

function normalizeAdContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\uFF09/g, ")")
    .replace(/\uFF08/g, "(");
}

const FRACTION_VALUES = new Set(["заря", "наемники", "завет", "рубеж"]);

const NABOR_REQUIRED_SECTIONS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11] as const;
const POISK_REQUIRED_SECTIONS = [1, 5, 6, 8, 10] as const;

const NOTICE_MAX_LEN = 3500;

function normalizeEnumValue(raw: string): string {
  return raw.trim().toLowerCase().replace(/ё/g, "е");
}

function isEmptyPlaceholder(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return lower === "-" || lower === "—";
}

export function parseNumberedSections(content: string): ParsedSection[] {
  const normalized = normalizeAdContent(content);
  const headers: Array<{ number: number; valueStart: number; matchStart: number }> = [];

  SECTION_HEADER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECTION_HEADER_RE.exec(normalized)) !== null) {
    const number = parseInt(match[1], 10);
    if (!Number.isFinite(number) || number < 1 || number > 11) continue;
    headers.push({
      number,
      valueStart: match.index + match[0].length,
      matchStart: match.index,
    });
  }

  const sections: ParsedSection[] = [];
  for (let i = 0; i < headers.length; i++) {
    const { number, valueStart } = headers[i];
    const valueEnd = i + 1 < headers.length ? headers[i + 1].matchStart : normalized.length;
    sections.push({ number, value: normalized.slice(valueStart, valueEnd).trim() });
  }
  return sections;
}

export function splitSectionsIntoBlocks(sections: ParsedSection[]): Map<number, string>[] {
  const blocks: Map<number, string>[] = [];
  let current: Map<number, string> | null = null;

  for (const { number, value } of sections) {
    if (number === 1 && current !== null && current.size > 0) {
      blocks.push(current);
      current = new Map();
    }
    if (current === null) {
      if (number !== 1) continue;
      current = new Map();
    }
    current.set(number, value);
  }

  if (current !== null && current.size > 0) {
    blocks.push(current);
  }
  return blocks;
}

function isValidFraction(value: string): boolean {
  return FRACTION_VALUES.has(normalizeEnumValue(value));
}

function validateNaborBlock(block: Map<number, string>, blockIndex: number, errors: ClanAdValidationError[]): void {
  for (const section of NABOR_REQUIRED_SECTIONS) {
    if (!block.has(section)) {
      errors.push({ code: "missing_section", section, blockIndex });
      continue;
    }
    const value = block.get(section) ?? "";
    if (isEmptyPlaceholder(value)) {
      errors.push({ code: "empty_required", section, blockIndex });
      continue;
    }
    if (section === 2 && !isValidFraction(value)) {
      errors.push({ code: "invalid_enum", section, blockIndex });
    }
  }
}

function containsForbiddenPoiskField10Word(value: string): boolean {
  const normalized = normalizeEnumValue(value);
  return normalized.includes("долг") || normalized.includes("свобода");
}

function validatePoiskBlock(block: Map<number, string>, blockIndex: number, errors: ClanAdValidationError[]): void {
  for (const section of POISK_REQUIRED_SECTIONS) {
    if (!block.has(section)) {
      errors.push({ code: "missing_section", section, blockIndex });
      continue;
    }
    const value = block.get(section) ?? "";
    if (section === 8) continue;
    if (isEmptyPlaceholder(value)) {
      errors.push({ code: "empty_required", section, blockIndex });
      continue;
    }
    if (section === 10 && containsForbiddenPoiskField10Word(value)) {
      errors.push({ code: "invalid_enum", section, blockIndex });
    }
  }
}

function looksLikeNaborForm(content: string): boolean {
  const blocks = splitSectionsIntoBlocks(parseNumberedSections(content));
  return blocks.length > 0 && blocks[0].has(11);
}

function resolveClanAdChannelId(formatId: ClanAdFormatId): string | undefined {
  for (const [channelId, id] of Object.entries(DISCORD_CLAN_AD_FORMAT_CHANNELS)) {
    if (id === formatId) return channelId;
  }
  const presetChannelId = DISCORD_MODERATION_CHANNEL_PRESET_CHANNEL_IDS[formatId];
  if (presetChannelId) return presetChannelId;
  if (formatId === "nabor_klany" && DISCORD_CLAN_RECRUIT_CHANNEL_ID) {
    return DISCORD_CLAN_RECRUIT_CHANNEL_ID;
  }
  return undefined;
}

async function handleNaborPostedInPoiskChannel(message: Message, member: GuildMember): Promise<void> {
  removePending(message.id);
  const naborChannelId = resolveClanAdChannelId("nabor_klany");
  await notifyClanAdUserDmOnly(member, fmtTxt.wrongChannelNaborInPoisk(naborChannelId));
  await message.delete().catch(() => undefined);
}

function validateNaborMessage(content: string): ClanAdValidationError[] {
  const sections = parseNumberedSections(content);
  const blocks = splitSectionsIntoBlocks(sections);
  const errors: ClanAdValidationError[] = [];

  if (blocks.length === 0) {
    errors.push({ code: "invalid_block_count", expected: "1-3", got: 0 });
    return errors;
  }
  if (blocks.length > 3) {
    errors.push({ code: "invalid_block_count", expected: "1-3", got: blocks.length });
  }

  const blocksToValidate = blocks.slice(0, 3);
  blocksToValidate.forEach((block, blockIndex) => {
    validateNaborBlock(block, blockIndex, errors);
  });
  return errors;
}

function validatePoiskMessage(content: string, hasAttachment: boolean): ClanAdValidationError[] {
  const sections = parseNumberedSections(content);
  const blocks = splitSectionsIntoBlocks(sections);
  const errors: ClanAdValidationError[] = [];

  if (blocks.length === 0) {
    errors.push({ code: "invalid_block_count", expected: "1", got: 0 });
    return errors;
  }
  if (blocks.length > 1) {
    errors.push({ code: "invalid_block_count", expected: "1", got: blocks.length });
  }

  validatePoiskBlock(blocks[0], 0, errors);
  if (!hasAttachment) {
    errors.push({ code: "missing_attachment" });
  }
  return errors;
}

export function validateClanAdMessage(
  content: string,
  formatId: ClanAdFormatId,
  hasAttachment: boolean,
): { ok: true } | { ok: false; errors: ClanAdValidationError[] } {
  const errors =
    formatId === "nabor_klany"
      ? validateNaborMessage(content)
      : validatePoiskMessage(content, hasAttachment);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function errorHint(error: ClanAdValidationError, formatId: ClanAdFormatId): string {
  void formatId;
  switch (error.code) {
    case "missing_section":
      return fmtTxt.hintMissingSection(error.section);
    case "empty_required":
      return fmtTxt.hintEmptyRequired(error.section);
    case "invalid_enum":
      return fmtTxt.hintFraction(error.section);
    case "invalid_block_count":
      return error.expected === "1-3"
        ? fmtTxt.hintBlockCountNabor(error.got)
        : fmtTxt.hintBlockCountPoisk(error.got);
    case "missing_attachment":
      return fmtTxt.hintMissingAttachment;
    default:
      return fmtTxt.hintGeneric;
  }
}

export function formatClanAdValidationErrors(
  errors: ClanAdValidationError[],
  formatId: ClanAdFormatId,
  pinUrl?: string,
  messageUrl?: string,
): string {
  const lines: string[] = [fmtTxt.introInvalid];
  if (messageUrl) {
    lines.push(fmtTxt.messageEditLink(messageUrl));
  }
  if (pinUrl) {
    lines.push(fmtTxt.pinLine(pinUrl));
  }
  lines.push(fmtTxt.editGraceHint(DISCORD_CLAN_AD_FORMAT_GRACE_MS));
  lines.push("");

  const messageLevel = errors.filter((e) => e.code === "invalid_block_count" || e.code === "missing_attachment");
  const fieldErrors = errors.filter((e) => e.code !== "invalid_block_count" && e.code !== "missing_attachment");

  for (const err of messageLevel) {
    lines.push(`• ${errorHint(err, formatId)}`);
  }

  if (formatId === "nabor_klany") {
    const byBlock = new Map<number, ClanAdValidationError[]>();
    for (const err of fieldErrors) {
      const idx = err.blockIndex ?? 0;
      const list = byBlock.get(idx) ?? [];
      list.push(err);
      byBlock.set(idx, list);
    }
    const sortedBlocks = [...byBlock.keys()].sort((a, b) => a - b);
    for (const blockIndex of sortedBlocks) {
      const blockErrs = byBlock.get(blockIndex) ?? [];
      if (blockErrs.length === 0) continue;
      if (sortedBlocks.length > 1 || messageLevel.length > 0) {
        lines.push("");
        lines.push(fmtTxt.formHeader(blockIndex + 1));
      }
      for (const err of blockErrs) {
        lines.push(`• ${errorHint(err, formatId)}`);
      }
    }
  } else {
    for (const err of fieldErrors) {
      lines.push(`• ${errorHint(err, formatId)}`);
    }
  }

  let text = lines.join("\n");
  if (text.length > NOTICE_MAX_LEN) {
    const kept: string[] = [];
    let len = 0;
    let omitted = 0;
    for (const line of lines) {
      const nextLen = len + line.length + 1;
      if (nextLen > NOTICE_MAX_LEN - 40) {
        omitted++;
        continue;
      }
      kept.push(line);
      len = nextLen;
    }
    if (omitted > 0) {
      kept.push(fmtTxt.errorsTruncated(omitted));
    }
    text = kept.join("\n");
  }
  return text;
}

function clearPendingTimer(pending: ClanAdPendingReview): void {
  if (pending.timeoutId !== undefined) {
    clearTimeout(pending.timeoutId);
    pending.timeoutId = undefined;
  }
}

function removePending(messageId: string): void {
  const pending = pendingClanAds.get(messageId);
  if (!pending) return;
  clearPendingTimer(pending);
  pendingClanAds.delete(messageId);
}

async function deleteChannelNoticeLater(message: Message, delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await message.delete().catch(() => undefined);
}

async function resolveMessageMember(message: Message): Promise<GuildMember | null> {
  if (message.member instanceof GuildMember) return message.member;
  if (!message.guild) return null;
  return message.guild.members.fetch(message.author.id).catch(() => null);
}

async function postClanAdChannelNotice(channelMessage: Message, content: string): Promise<void> {
  const ch = channelMessage.channel;
  if (!ch.isTextBased() || !("send" in ch)) return;
  const notice = await ch.send({ content: content.slice(0, 2000) }).catch(() => null);
  if (notice) {
    void deleteChannelNoticeLater(notice, DISCORD_WARNING_MESSAGE_TTL_MS);
  }
}

async function notifyClanAdUserDmOnly(member: GuildMember, content: string): Promise<void> {
  await member.send({ content: content.slice(0, 2000) }).catch(() => undefined);
}

async function notifyClanAdUser(
  member: GuildMember,
  channelMessage: Message,
  content: string,
): Promise<void> {
  let dmSent = false;
  try {
    await member.send({ content: content.slice(0, 2000) });
    dmSent = true;
  } catch {
    dmSent = false;
  }

  const ch = channelMessage.channel;
  if (!ch.isTextBased() || !("send" in ch)) return;

  const channelContent = dmSent
    ? fmtTxt.channelCheckDm(member.id)
    : content.slice(0, 2000);
  const notice = await ch.send({ content: channelContent }).catch(() => null);
  if (notice) {
    void deleteChannelNoticeLater(notice, DISCORD_WARNING_MESSAGE_TTL_MS);
  }
}

async function fetchFullMessage(message: Message | PartialMessage): Promise<Message | null> {
  if (message.partial) {
    return message.fetch().catch(() => null);
  }
  return message as Message;
}

async function resolvePendingMessage(pending: ClanAdPendingReview, fallback?: Message): Promise<Message | null> {
  if (fallback?.guild) {
    const ch = await fallback.guild.channels.fetch(pending.channelId).catch(() => null);
    if (ch?.isTextBased()) {
      return ch.messages.fetch(pending.messageId).catch(() => null);
    }
  }
  return null;
}

async function deleteExpiredPendingMessage(message: Message, pending: ClanAdPendingReview): Promise<void> {
  if (!pendingClanAds.has(pending.messageId)) return;
  removePending(pending.messageId);

  const member = message.member ?? (await message.guild?.members.fetch(pending.authorId).catch(() => null) ?? null);
  await message.delete().catch(() => undefined);
  if (member) {
    await notifyClanAdUserDmOnly(member, fmtTxt.expiredDeleted);
  }
}

function schedulePendingExpiry(pending: ClanAdPendingReview, fallbackMessage: Message): void {
  clearPendingTimer(pending);
  const delay = pending.deadlineMs - Date.now();
  const run = () => {
    void (async () => {
      const message = await resolvePendingMessage(pending, fallbackMessage);
      if (message) {
        await deleteExpiredPendingMessage(message, pending);
      } else {
        removePending(pending.messageId);
      }
    })();
  };
  if (delay <= 0) {
    run();
    return;
  }
  pending.timeoutId = setTimeout(run, delay);
}

function startPendingReview(
  message: Message,
  member: GuildMember,
  formatId: ClanAdFormatId,
  errorsText: string,
): void {
  const messageId = message.id;
  removePending(messageId);

  const pending: ClanAdPendingReview = {
    messageId,
    guildId: message.guildId!,
    channelId: message.channelId,
    authorId: message.author.id,
    formatId,
    deadlineMs: Date.now() + DISCORD_CLAN_AD_FORMAT_GRACE_MS,
  };
  pendingClanAds.set(messageId, pending);
  schedulePendingExpiry(pending, message);

  void notifyClanAdUser(member, message, errorsText);
}

function resetPendingDeadline(pending: ClanAdPendingReview, message: Message): void {
  pending.deadlineMs = Date.now() + DISCORD_CLAN_AD_FORMAT_GRACE_MS;
  schedulePendingExpiry(pending, message);
}

function shouldBypassClanAdCheck(member: GuildMember): boolean {
  return isModerationProtectedTarget(member) || isDiscordModerator(member) || isDiscordAdmin(member);
}

function clanAdFormatForMessage(message: Message | PartialMessage): ClanAdFormatId | undefined {
  if (!message.channelId) return undefined;
  return DISCORD_CLAN_AD_FORMAT_CHANNELS[message.channelId];
}

function evaluateClanAdMessage(message: Message): { ok: true } | { ok: false; errorsText: string } {
  const formatId = DISCORD_CLAN_AD_FORMAT_CHANNELS[message.channelId];
  if (!formatId) return { ok: true };

  const hasAttachment = message.attachments.size > 0;
  const result = validateClanAdMessage(message.content, formatId, hasAttachment);
  if (result.ok) return { ok: true };

  const pinUrl = DISCORD_CLAN_AD_FORMAT_PIN_URLS[formatId];
  const messageUrl = message.guildId
    ? `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`
    : undefined;
  return {
    ok: false,
    errorsText: formatClanAdValidationErrors(result.errors, formatId, pinUrl, messageUrl),
  };
}

/** Returns true when the message was handled (pending review started). */
export async function handleClanAdFormatMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || message.author.bot || message.system) return false;

  const formatId = clanAdFormatForMessage(message);
  if (!formatId) return false;

  const member = await resolveMessageMember(message);
  if (!member) {
    if (LOG_LEVEL === "debug") {
      console.debug(`Clan ad format: could not resolve member for message ${message.id}`);
    }
    return false;
  }
  if (!DISCORD_DEV_MODE && shouldBypassClanAdCheck(member)) {
    if (LOG_LEVEL === "debug") {
      console.debug(`Clan ad format: staff bypass for message ${message.id}`);
    }
    return false;
  }

  if (formatId === "poisk_klanov" && looksLikeNaborForm(message.content)) {
    await handleNaborPostedInPoiskChannel(message, member);
    return true;
  }

  const evaluation = evaluateClanAdMessage(message);
  if (evaluation.ok) return false;

  if (LOG_LEVEL === "debug") {
    console.debug(`Clan ad format: pending review for message ${message.id} (${formatId})`);
  }
  startPendingReview(message, member, formatId, evaluation.errorsText);
  return true;
}

/** Returns true when a pending clan ad was updated. */
export async function handleClanAdFormatMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<boolean> {
  if (!newMessage.inGuild() || newMessage.author?.bot) return false;

  const formatId = clanAdFormatForMessage(newMessage);
  if (!formatId) return false;

  const messageId = newMessage.id;

  const contentChanged = oldMessage.content !== newMessage.content;
  const attachmentsChanged =
    (oldMessage.attachments?.size ?? 0) !== (newMessage.attachments?.size ?? 0);
  if (!contentChanged && !attachmentsChanged) return false;

  const message = await fetchFullMessage(newMessage);
  if (!message) return false;

  const member = message.member ?? (await resolveMessageMember(message));
  if (!member || (!DISCORD_DEV_MODE && shouldBypassClanAdCheck(member))) {
    const hadPending = pendingClanAds.has(messageId);
    removePending(messageId);
    return hadPending;
  }

  if (formatId === "poisk_klanov" && looksLikeNaborForm(message.content)) {
    await handleNaborPostedInPoiskChannel(message, member);
    return true;
  }

  const pending = pendingClanAds.get(messageId);
  if (!pending) return false;

  const evaluation = evaluateClanAdMessage(message);
  if (evaluation.ok) {
    removePending(messageId);
    await postClanAdChannelNotice(message, fmtTxt.approvedChannel(member.id));
    return true;
  }

  resetPendingDeadline(pending, message);
  await notifyClanAdUser(member, message, evaluation.errorsText);
  return true;
}

export function clearClanAdPendingOnDelete(messageId: string): void {
  removePending(messageId);
}

export function isClanAdPendingMessage(messageId: string): boolean {
  return pendingClanAds.has(messageId);
}

import { GuildMember, Message } from "discord.js";
import {
  DISCORD_CLAN_AD_FORMAT_CHANNELS,
  DISCORD_CLAN_AD_FORMAT_PIN_URLS,
  type ClanAdFormatId,
} from "../config";
import { CLAN_NAME_MAX_LEN, CLAN_NAME_MIN_LEN } from "./clanRoles/constants";
import { validateClanName } from "./clanRoles/helpers";
import { isDiscordAdmin, isDiscordModerator, isModerationProtectedTarget } from "./guildPermissions";
import { applyLightStrikeForMessage } from "./moderation";
import { discordClanAdFormat as fmtTxt } from "./userStrings";

export type ClanAdValidationError =
  | { code: "missing_section"; section: number; blockIndex?: number }
  | { code: "empty_required"; section: number; blockIndex?: number }
  | { code: "invalid_clan_name"; reason: "length" | "chars" | "brackets"; blockIndex?: number }
  | { code: "invalid_enum"; section: number; blockIndex?: number }
  | { code: "invalid_block_count"; expected: "1-3" | "1"; got: number }
  | { code: "missing_attachment" };

type ParsedSection = { number: number; value: string };

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

const NABOR_FIELD_9_VALUES = new Set(["да", "нет", "+", "-"]);
const NABOR_FIELD_10_VALUES = new Set(["да", "нет", "+", "-", "онли кувалды"]);

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
  return lower === "-" || lower === "—" || lower === "нет";
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

function isValidNaborField9(value: string): boolean {
  return NABOR_FIELD_9_VALUES.has(normalizeEnumValue(value));
}

function isValidNaborField10(value: string): boolean {
  return NABOR_FIELD_10_VALUES.has(normalizeEnumValue(value));
}

function validateNaborBlock(block: Map<number, string>, blockIndex: number, errors: ClanAdValidationError[]): void {
  for (const section of NABOR_REQUIRED_SECTIONS) {
    if (!block.has(section)) {
      errors.push({ code: "missing_section", section, blockIndex });
      continue;
    }
    const value = block.get(section) ?? "";
    if (section === 9) {
      if (!value.trim()) {
        errors.push({ code: "empty_required", section, blockIndex });
      } else if (!isValidNaborField9(value)) {
        errors.push({ code: "invalid_enum", section, blockIndex });
      }
      continue;
    }
    if (section === 10) {
      if (!value.trim()) {
        errors.push({ code: "empty_required", section, blockIndex });
      } else if (!isValidNaborField10(value)) {
        errors.push({ code: "invalid_enum", section, blockIndex });
      }
      continue;
    }
    if (isEmptyPlaceholder(value)) {
      errors.push({ code: "empty_required", section, blockIndex });
      continue;
    }
    if (section === 1) {
      const nameErr = validateClanName(value, CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN);
      if (nameErr === "length" || nameErr === "chars" || nameErr === "brackets") {
        errors.push({ code: "invalid_clan_name", reason: nameErr, blockIndex });
      }
    } else if (section === 2) {
      if (!isValidFraction(value)) {
        errors.push({ code: "invalid_enum", section, blockIndex });
      }
    }
  }
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
    if (section === 10 && !isValidFraction(value)) {
      errors.push({ code: "invalid_enum", section, blockIndex });
    }
  }
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
  switch (error.code) {
    case "missing_section":
      return fmtTxt.hintMissingSection(error.section);
    case "empty_required":
      return fmtTxt.hintEmptyRequired(error.section);
    case "invalid_clan_name":
      if (error.reason === "length") {
        return fmtTxt.hintClanNameLength(CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN);
      }
      if (error.reason === "chars") {
        return fmtTxt.hintClanNameChars;
      }
      return fmtTxt.hintClanNameTag;
    case "invalid_enum":
      if (error.section === 2) {
        return fmtTxt.hintFraction(error.section);
      }
      if (error.section === 9) {
        return fmtTxt.hintNaborField9;
      }
      if (error.section === 10) {
        return formatId === "nabor_klany" ? fmtTxt.hintNaborField10 : fmtTxt.hintFraction(error.section);
      }
      return fmtTxt.hintGeneric;
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
): string {
  const lines: string[] = [fmtTxt.intro];
  if (pinUrl) {
    lines.push(fmtTxt.pinLine(pinUrl));
  }
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

function logTitleForFormat(formatId: ClanAdFormatId): string {
  return formatId === "nabor_klany" ? fmtTxt.logTitleNabor : fmtTxt.logTitlePoisk;
}

/** Returns true when the message was handled (deleted + light strike). */
export async function handleClanAdFormatMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || message.author.bot || message.system) return false;

  const formatId = DISCORD_CLAN_AD_FORMAT_CHANNELS[message.channelId];
  if (!formatId) return false;

  const member = message.member;
  if (!(member instanceof GuildMember)) return false;
  if (isModerationProtectedTarget(member)) return false;
  if (isDiscordModerator(member) || isDiscordAdmin(member)) return false;

  const hasAttachment = message.attachments.size > 0;
  const result = validateClanAdMessage(message.content, formatId, hasAttachment);
  if (result.ok) return false;

  const pinUrl = DISCORD_CLAN_AD_FORMAT_PIN_URLS[formatId];
  const reason = formatClanAdValidationErrors(result.errors, formatId, pinUrl);
  await applyLightStrikeForMessage(message, member, reason, logTitleForFormat(formatId));
  return true;
}

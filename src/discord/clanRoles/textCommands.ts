import type { Guild, GuildMember, MessageMentions, Role } from "discord.js";
import {
  DISCORD_CLAN_ROSTER_MAX,
  DISCORD_CLAN_ROSTER_MIN,
} from "../../config";
import type { ClanColorPreset } from "../../config";
import { getClanColorPresetByLabel } from "./colorPresets";
import { CLAN_NAME_MAX_LEN, CLAN_NAME_MIN_LEN, MAX_CLAN_LEADERS } from "./constants";
import { parseLeaderIdsFromMentions, validateClanName } from "./helpers";
import { isClanModerator } from "./permissions";
import {
  isClanLeaderFor,
  listMemberClanRoles,
  resolveClanRole,
} from "./resolver";
import { clanTxt } from "./strings";

export type ParsedGrantCommand = {
  kind: "grant";
  clanRole: Role;
  targetUserId: string;
};

export type ParsedRemoveCommand = {
  kind: "remove";
  clanRole: Role;
  targetUserId: string;
};

export type ParsedCreateCommand = {
  kind: "create";
  clanName: string;
  colorPreset: ClanColorPreset;
  memberIds: string[];
  leaderIds: string[];
};

export type ClanTextParseError = {
  kind: "error";
  message: string;
};

export type ClanTextCommand = ParsedGrantCommand | ParsedRemoveCommand | ParsedCreateCommand;

const GRANT_PREFIX = /^\+клан\s*:?\s*/i;
const REMOVE_PREFIX = /^-клан\s*:?\s*/i;
const CREATE_HEADER = /^!создать\s*$/i;

function stripMentions(text: string): string {
  return text.replace(/<@!?\d+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMentionId(mentions: MessageMentions): string | undefined {
  return mentions.users.first()?.id;
}

function resolveClanQuery(guild: Guild, query: string): Role | ClanTextParseError {
  const matches = resolveClanRole(guild, query);
  if (matches.length === 0) {
    return { kind: "error", message: clanTxt.cmdClanNotFound(query) };
  }
  if (matches.length > 1) {
    return { kind: "error", message: clanTxt.cmdClanAmbiguous };
  }
  return matches[0];
}

function isParseError(value: Role | ClanTextParseError): value is ClanTextParseError {
  return "kind" in value && value.kind === "error";
}

function listLedClanRoles(guild: Guild, member: GuildMember): Role[] {
  return listMemberClanRoles(guild, member).filter((role) => isClanLeaderFor(member, role.id));
}

function parseGrantCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
  mentions: MessageMentions,
): ParsedGrantCommand | ClanTextParseError {
  const targetMentionId = firstMentionId(mentions);
  const clanQuery = stripMentions(body);
  const isMod = isClanModerator(member);
  const ledClans = listLedClanRoles(guild, member);

  if (targetMentionId) {
    if (!isMod && ledClans.length === 0) {
      return { kind: "error", message: clanTxt.cmdTargetOnlyLeaderMod };
    }

    if (clanQuery) {
      const resolved = resolveClanQuery(guild, clanQuery);
      if (isParseError(resolved)) return resolved;
      return { kind: "grant", clanRole: resolved, targetUserId: targetMentionId };
    }

    if (ledClans.length === 1) {
      return { kind: "grant", clanRole: ledClans[0], targetUserId: targetMentionId };
    }
    if (ledClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdLeaderMultipleClans };
    }

    const targetMember = guild.members.cache.get(targetMentionId);
    if (!targetMember) {
      return { kind: "error", message: clanTxt.targetMissing };
    }
    const targetClans = listMemberClanRoles(guild, targetMember);
    if (targetClans.length === 1) {
      return { kind: "grant", clanRole: targetClans[0], targetUserId: targetMentionId };
    }
    if (targetClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdTargetMultipleClans };
    }
    return { kind: "error", message: clanTxt.cmdClanAmbiguous };
  }

  if (!clanQuery) {
    return { kind: "error", message: clanTxt.cmdInvalidFormat("+клан Название или +клан Название @участник") };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;
  return { kind: "grant", clanRole: resolved, targetUserId: member.id };
}

function parseRemoveCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
  mentions: MessageMentions,
): ParsedRemoveCommand | ClanTextParseError {
  const targetMentionId = firstMentionId(mentions);
  const clanQuery = stripMentions(body);
  const isMod = isClanModerator(member);
  const ownClans = listMemberClanRoles(guild, member);
  const ledClans = listLedClanRoles(guild, member);

  if (!targetMentionId && !clanQuery) {
    if (isMod) {
      return { kind: "error", message: clanTxt.cmdModNeedsTarget };
    }
    if (ownClans.length === 0) {
      return { kind: "error", message: clanTxt.cmdNoClanRoles };
    }
    if (ownClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdClanAmbiguous };
    }
    return { kind: "remove", clanRole: ownClans[0], targetUserId: member.id };
  }

  if (targetMentionId && !clanQuery) {
    if (ledClans.length === 1) {
      const role = ledClans[0];
      const target = guild.members.cache.get(targetMentionId);
      if (!target?.roles.cache.has(role.id)) {
        return { kind: "error", message: clanTxt.cmdTargetNotInClan };
      }
      return { kind: "remove", clanRole: role, targetUserId: targetMentionId };
    }
    if (ledClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdLeaderMultipleClans };
    }
    if (isMod) {
      const target = guild.members.cache.get(targetMentionId);
      if (!target) {
        return { kind: "error", message: clanTxt.targetMissing };
      }
      const targetClans = listMemberClanRoles(guild, target);
      if (targetClans.length === 1) {
        return { kind: "remove", clanRole: targetClans[0], targetUserId: targetMentionId };
      }
      if (targetClans.length > 1) {
        return { kind: "error", message: clanTxt.cmdTargetMultipleClans };
      }
      return { kind: "error", message: clanTxt.cmdClanNotFound("—") };
    }
    return { kind: "error", message: clanTxt.cmdInvalidFormat("-клан Название @участник") };
  }

  if (!clanQuery) {
    return { kind: "error", message: clanTxt.cmdInvalidFormat("-клан Название или -клан @участник") };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;

  const targetUserId = targetMentionId ?? member.id;
  if (targetUserId === member.id) {
    if (!isMod && !member.roles.cache.has(resolved.id)) {
      return { kind: "error", message: clanTxt.removeNotYourClanRole };
    }
  } else {
    const isLeader = isClanLeaderFor(member, resolved.id);
    if (!isMod && !isLeader) {
      return { kind: "error", message: clanTxt.cmdTargetOnlyLeaderMod };
    }
    const target = guild.members.cache.get(targetUserId);
    if (!target?.roles.cache.has(resolved.id)) {
      return { kind: "error", message: clanTxt.cmdTargetNotInClan };
    }
  }

  return { kind: "remove", clanRole: resolved, targetUserId };
}

function parseCreateCommand(
  guild: Guild,
  content: string,
  mentions: MessageMentions,
): ParsedCreateCommand | ClanTextParseError {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  if (lines.length < 4 || !CREATE_HEADER.test(lines[0] ?? "")) {
    return { kind: "error", message: clanTxt.cmdCreateInvalidHeader };
  }

  const clanName = lines[1]?.trim() ?? "";
  const colorLabel = lines[2]?.trim() ?? "";
  const rosterLines = lines.slice(3).join("\n");

  const invalid = validateClanName(clanName, CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN);
  if (invalid) {
    return { kind: "error", message: clanTxt.wizardNameInvalid(CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN) };
  }
  const dup = guild.roles.cache.find((r) => r.name.toLowerCase() === clanName.toLowerCase());
  if (dup) {
    return { kind: "error", message: clanTxt.wizardNameDuplicate };
  }

  const preset = getClanColorPresetByLabel(colorLabel);
  if (!preset) {
    return { kind: "error", message: clanTxt.cmdCreateInvalidColor(colorLabel) };
  }

  const memberIds = [...new Set(mentions.users.keys())];
  if (memberIds.length < DISCORD_CLAN_ROSTER_MIN || memberIds.length > DISCORD_CLAN_ROSTER_MAX) {
    return { kind: "error", message: clanTxt.wizardRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX) };
  }

  const onServer: string[] = [];
  for (const id of memberIds) {
    const m = guild.members.cache.get(id);
    if (m) onServer.push(id);
  }
  if (onServer.length !== memberIds.length) {
    return { kind: "error", message: clanTxt.wizardRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX) };
  }

  let leaders = parseLeaderIdsFromMentions(rosterLines, onServer);
  if (leaders.length === 0 && onServer.length >= 1) {
    leaders = [onServer[0]];
  }
  if (leaders.length < 1 || leaders.length > MAX_CLAN_LEADERS) {
    return { kind: "error", message: clanTxt.wizardLeadersInvalid };
  }
  if (!leaders.every((id) => onServer.includes(id))) {
    return { kind: "error", message: clanTxt.wizardLeadersInvalid };
  }

  return {
    kind: "create",
    clanName,
    colorPreset: preset,
    memberIds: onServer,
    leaderIds: leaders,
  };
}

export function parseClanTextCommand(
  guild: Guild,
  member: GuildMember,
  content: string,
  mentions: MessageMentions,
): ClanTextCommand | ClanTextParseError | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (CREATE_HEADER.test(trimmed.split(/\r?\n/)[0] ?? "")) {
    return parseCreateCommand(guild, content, mentions);
  }

  if (GRANT_PREFIX.test(trimmed)) {
    const body = trimmed.replace(GRANT_PREFIX, "").trim();
    return parseGrantCommand(guild, member, body, mentions);
  }

  if (REMOVE_PREFIX.test(trimmed)) {
    const body = trimmed.replace(REMOVE_PREFIX, "").trim();
    return parseRemoveCommand(guild, member, body, mentions);
  }

  return null;
}

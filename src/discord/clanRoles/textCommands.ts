import type { Guild, GuildMember, MessageMentions, Role } from "discord.js";
import {
  DISCORD_CLAN_ROSTER_MAX,
  DISCORD_CLAN_ROSTER_MIN,
} from "../../config";
import type { ClanColorPreset } from "../../config";
import { formatClanColorPresetOptions, resolveClanCreateColor, splitClanQueryAndColorInput } from "./colorPresets";
import { CLAN_NAME_MAX_LEN, CLAN_NAME_MIN_LEN, MAX_CLAN_LEADERS } from "./constants";
import { isClanTierEligibleForCreate, parseClanTier, parseLeaderIdsFromMentions, parseMentionIdsInOrder, validateClanName } from "./helpers";
import { isClanModerator } from "./permissions";
import {
  getMemberClanRoleCapConflict,
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

export type ParsedGrantLeaderCommand = {
  kind: "grant_leader";
  clanRole: Role;
  targetUserId: string;
};

export type ParsedRemoveLeaderCommand = {
  kind: "remove_leader";
  clanRole: Role;
  targetUserId: string;
};

export type ParsedCreateCommand = {
  kind: "create";
  clanName: string;
  clanTier: string;
  colorPreset: ClanColorPreset;
  memberIds: string[];
  leaderIds: string[];
};

export type ParsedRosterCommand = {
  kind: "roster";
  clanRole: Role;
};

export type ParsedChangeColorCommand = {
  kind: "change_color";
  clanRole: Role;
  colorPreset: ClanColorPreset;
};

export type ClanTextParseError = {
  kind: "error";
  message: string;
};

export type ClanTextCommand =
  | ParsedGrantCommand
  | ParsedRemoveCommand
  | ParsedGrantLeaderCommand
  | ParsedRemoveLeaderCommand
  | ParsedCreateCommand
  | ParsedRosterCommand
  | ParsedChangeColorCommand;

const GRANT_PREFIX = /^\+клан\s*:?\s*/i;
const REMOVE_PREFIX = /^-клан\s*:?\s*/i;
const GRANT_LEADER_PREFIX = /^\+лидер\s*:?\s*/i;
const REMOVE_LEADER_PREFIX = /^-лидер\s*:?\s*/i;
const CREATE_HEADER = /^!создать\s*$/i;
const ROSTER_PREFIX = /^!состав\s*:?\s*/i;
const CHANGE_COLOR_PREFIX = /^!цвет\s*:?\s*/i;

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

/** Leaders may `-клан` themselves or non-leaders; only admins may strip a leader's clan role. */
function leaderRemoveClanRoleTargetBlocked(
  guild: Guild,
  actor: GuildMember,
  targetUserId: string,
  clanRoleId: string,
): ClanTextParseError | null {
  if (isClanModerator(actor)) return null;
  if (targetUserId === actor.id) return null;
  const target = guild.members.cache.get(targetUserId);
  if (target && isClanLeaderFor(target, clanRoleId)) {
    return { kind: "error", message: clanTxt.cmdLeaderRemoveClanRoleFromLeader };
  }
  return null;
}

function listLedClanRoles(guild: Guild, member: GuildMember): Role[] {
  return listMemberClanRoles(guild, member).filter((role) => isClanLeaderFor(member, role.id));
}

function validateGrantTargetCap(
  guild: Guild,
  targetUserId: string,
  clanRole: Role,
  actorId: string,
): ClanTextParseError | null {
  const target = guild.members.cache.get(targetUserId);
  if (!target) return { kind: "error", message: clanTxt.targetMissing };
  const conflict = getMemberClanRoleCapConflict(guild, target, clanRole.id);
  if (!conflict) return null;
  return {
    kind: "error",
    message:
      targetUserId === actorId
        ? clanTxt.clanRoleCapSelf(conflict.name)
        : clanTxt.clanRoleCapTarget(conflict.name),
  };
}

function finishGrant(
  guild: Guild,
  member: GuildMember,
  clanRole: Role,
  targetUserId: string,
): ParsedGrantCommand | ClanTextParseError {
  const capErr = validateGrantTargetCap(guild, targetUserId, clanRole, member.id);
  if (capErr) return capErr;
  return { kind: "grant", clanRole, targetUserId };
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
      return finishGrant(guild, member, resolved, targetMentionId);
    }

    if (ledClans.length === 1) {
      return finishGrant(guild, member, ledClans[0], targetMentionId);
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
      return finishGrant(guild, member, targetClans[0], targetMentionId);
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
  return finishGrant(guild, member, resolved, member.id);
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
      const leaderBlock = leaderRemoveClanRoleTargetBlocked(guild, member, targetMentionId, role.id);
      if (leaderBlock) return leaderBlock;
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
    const leaderBlock = leaderRemoveClanRoleTargetBlocked(guild, member, targetUserId, resolved.id);
    if (leaderBlock) return leaderBlock;
  }

  return { kind: "remove", clanRole: resolved, targetUserId };
}

function leaderMetaNotInClanError(
  clanName: string,
  targetUserId: string,
  actorId: string,
): ClanTextParseError {
  return {
    kind: "error",
    message:
      targetUserId === actorId
        ? clanTxt.leaderMetaNeedsClanFirstSelf(clanName)
        : clanTxt.leaderMetaNeedsClanFirstTarget(clanName),
  };
}

function parseGrantLeaderCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
  mentions: MessageMentions,
): ParsedGrantLeaderCommand | ClanTextParseError {
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
      const target = guild.members.cache.get(targetMentionId);
      if (!target?.roles.cache.has(resolved.id)) {
        return leaderMetaNotInClanError(resolved.name, targetMentionId, member.id);
      }
      if (isClanLeaderFor(target, resolved.id)) {
        return { kind: "error", message: clanTxt.alreadyClanLeader };
      }
      return { kind: "grant_leader", clanRole: resolved, targetUserId: targetMentionId };
    }

    if (ledClans.length === 1) {
      const role = ledClans[0];
      const target = guild.members.cache.get(targetMentionId);
      if (!target?.roles.cache.has(role.id)) {
        return leaderMetaNotInClanError(role.name, targetMentionId, member.id);
      }
      if (isClanLeaderFor(target, role.id)) {
        return { kind: "error", message: clanTxt.alreadyClanLeader };
      }
      return { kind: "grant_leader", clanRole: role, targetUserId: targetMentionId };
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
      if (isClanLeaderFor(targetMember, targetClans[0].id)) {
        return { kind: "error", message: clanTxt.alreadyClanLeader };
      }
      return { kind: "grant_leader", clanRole: targetClans[0], targetUserId: targetMentionId };
    }
    if (targetClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdTargetMultipleClans };
    }
    return { kind: "error", message: clanTxt.leaderMetaNeedsClanFirstAny };
  }

  if (!clanQuery) {
    const ownClans = listMemberClanRoles(guild, member);
    if (ownClans.length === 0) {
      return { kind: "error", message: clanTxt.leaderMetaNeedsClanFirstAny };
    }
    if (ownClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdClanAmbiguous };
    }
    const role = ownClans[0];
    if (isClanLeaderFor(member, role.id)) {
      return { kind: "error", message: clanTxt.alreadyClanLeader };
    }
    return { kind: "grant_leader", clanRole: role, targetUserId: member.id };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;
  if (!member.roles.cache.has(resolved.id)) {
    return leaderMetaNotInClanError(resolved.name, member.id, member.id);
  }
  if (isClanLeaderFor(member, resolved.id)) {
    return { kind: "error", message: clanTxt.alreadyClanLeader };
  }
  return { kind: "grant_leader", clanRole: resolved, targetUserId: member.id };
}

function parseRemoveLeaderCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
  mentions: MessageMentions,
): ParsedRemoveLeaderCommand | ClanTextParseError {
  const targetMentionId = firstMentionId(mentions);
  const clanQuery = stripMentions(body);
  const isMod = isClanModerator(member);
  const ledClans = listLedClanRoles(guild, member);

  if (!isMod && targetMentionId && targetMentionId !== member.id) {
    return { kind: "error", message: clanTxt.cmdLeaderRemoveLeaderSelfOnly };
  }

  if (!targetMentionId && !clanQuery) {
    if (isMod) {
      return { kind: "error", message: clanTxt.cmdModNeedsTarget };
    }
    if (ledClans.length === 0) {
      return { kind: "error", message: clanTxt.notClanLeader };
    }
    if (ledClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdLeaderMultipleClans };
    }
    return { kind: "remove_leader", clanRole: ledClans[0], targetUserId: member.id };
  }

  if (targetMentionId && !clanQuery) {
    if (isMod) {
      const target = guild.members.cache.get(targetMentionId);
      if (!target) {
        return { kind: "error", message: clanTxt.targetMissing };
      }
      const targetLed = listLedClanRoles(guild, target);
      if (targetLed.length === 1) {
        return { kind: "remove_leader", clanRole: targetLed[0], targetUserId: targetMentionId };
      }
      if (targetLed.length > 1) {
        return { kind: "error", message: clanTxt.cmdTargetMultipleClans };
      }
      return { kind: "error", message: clanTxt.notClanLeader };
    }
    return { kind: "error", message: clanTxt.cmdInvalidFormat("-лидер или -лидер Название") };
  }

  if (!clanQuery) {
    return { kind: "error", message: clanTxt.cmdInvalidFormat("-лидер или -лидер Название") };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;

  const targetUserId = targetMentionId ?? member.id;
  if (!isMod && targetUserId !== member.id) {
    return { kind: "error", message: clanTxt.cmdLeaderRemoveLeaderSelfOnly };
  }

  if (targetUserId === member.id) {
    if (!isMod && !isClanLeaderFor(member, resolved.id)) {
      return { kind: "error", message: clanTxt.notClanLeader };
    }
  } else {
    const target = guild.members.cache.get(targetUserId);
    if (!target || !isClanLeaderFor(target, resolved.id)) {
      return { kind: "error", message: clanTxt.notClanLeader };
    }
  }

  return { kind: "remove_leader", clanRole: resolved, targetUserId };
}

function parseCreateCommand(
  guild: Guild,
  content: string,
  mentions: MessageMentions,
  applicantId: string,
): ParsedCreateCommand | ClanTextParseError {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  if (lines.length < 5 || !CREATE_HEADER.test(lines[0] ?? "")) {
    return { kind: "error", message: clanTxt.cmdCreateInvalidHeader };
  }

  const clanName = lines[1]?.trim() ?? "";
  const tierInput = lines[2]?.trim() ?? "";
  const colorLabel = lines[3]?.trim() ?? "";
  const rosterText = lines.slice(4).join("\n");

  const invalid = validateClanName(clanName, CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN);
  if (invalid === "brackets") {
    return { kind: "error", message: clanTxt.createNameContainsTag };
  }
  if (invalid) {
    return { kind: "error", message: clanTxt.createNameInvalid(CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN) };
  }
  const dup = guild.roles.cache.find((r) => r.name.toLowerCase() === clanName.toLowerCase());
  if (dup) {
    return { kind: "error", message: clanTxt.createNameDuplicate };
  }

  if (!tierInput) {
    return { kind: "error", message: clanTxt.createTierMissing };
  }
  const clanTier = parseClanTier(tierInput);
  if (!clanTier) {
    return { kind: "error", message: clanTxt.createTierInvalid };
  }
  if (!isClanTierEligibleForCreate(clanTier)) {
    return { kind: "error", message: clanTxt.createTierTooLow };
  }

  const preset = resolveClanCreateColor(colorLabel);
  if (!preset) {
    return { kind: "error", message: clanTxt.cmdCreateInvalidColor(colorLabel, formatClanColorPresetOptions()) };
  }

  const mentionSet = new Set(mentions.users.keys());
  const orderedFromText = parseMentionIdsInOrder(rosterText);
  const memberIds: string[] = [];
  for (const id of orderedFromText) {
    if (mentionSet.has(id)) memberIds.push(id);
  }
  for (const id of mentionSet) {
    if (!memberIds.includes(id)) memberIds.push(id);
  }

  if (memberIds.length < DISCORD_CLAN_ROSTER_MIN || memberIds.length > DISCORD_CLAN_ROSTER_MAX) {
    return { kind: "error", message: clanTxt.createRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX) };
  }

  const onServer: string[] = [];
  for (const id of memberIds) {
    const m = guild.members.cache.get(id);
    if (m) onServer.push(id);
  }
  if (onServer.length !== memberIds.length) {
    return { kind: "error", message: clanTxt.createRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX) };
  }

  let leaders = parseLeaderIdsFromMentions(rosterText, onServer);
  if (leaders.length === 0 && onServer.length >= 1) {
    leaders = onServer.includes(applicantId) ? [applicantId] : [onServer[0]];
  }
  if (leaders.length < 1 || leaders.length > MAX_CLAN_LEADERS) {
    return { kind: "error", message: clanTxt.createLeadersInvalid };
  }
  if (!leaders.every((id) => onServer.includes(id))) {
    return { kind: "error", message: clanTxt.createLeadersInvalid };
  }

  for (const id of onServer) {
    const m = guild.members.cache.get(id);
    if (!m) continue;
    const conflict = getMemberClanRoleCapConflict(guild, m);
    if (conflict) {
      return { kind: "error", message: clanTxt.createMemberClanRoleCap(id, conflict.name) };
    }
  }

  return {
    kind: "create",
    clanName,
    clanTier,
    colorPreset: preset,
    memberIds: onServer,
    leaderIds: leaders,
  };
}

function parseRosterCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
): ParsedRosterCommand | ClanTextParseError {
  const clanQuery = body.trim();
  const isMod = isClanModerator(member);
  const ledClans = listLedClanRoles(guild, member);

  if (!clanQuery) {
    if (ledClans.length === 0) {
      if (isMod) {
        return { kind: "error", message: clanTxt.cmdRosterModNeedsClan };
      }
      return { kind: "error", message: clanTxt.cmdRosterLeaderOnly };
    }
    if (ledClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdLeaderMultipleClans };
    }
    return { kind: "roster", clanRole: ledClans[0] };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;

  if (!isMod && !isClanLeaderFor(member, resolved.id)) {
    return { kind: "error", message: clanTxt.cmdRosterNotYourClan(resolved.name) };
  }

  return { kind: "roster", clanRole: resolved };
}

function parseChangeColorCommand(
  guild: Guild,
  member: GuildMember,
  body: string,
): ParsedChangeColorCommand | ClanTextParseError {
  const colorOptions = formatClanColorPresetOptions();
  const split = splitClanQueryAndColorInput(body);
  if (!split) {
    return { kind: "error", message: clanTxt.cmdColorInvalidFormat(colorOptions) };
  }

  const preset = resolveClanCreateColor(split.colorInput);
  if (!preset) {
    return { kind: "error", message: clanTxt.cmdCreateInvalidColor(split.colorInput, colorOptions) };
  }

  const isMod = isClanModerator(member);
  const ledClans = listLedClanRoles(guild, member);
  const clanQuery = split.clanQuery;

  if (!clanQuery) {
    if (ledClans.length === 0) {
      if (isMod) {
        return { kind: "error", message: clanTxt.cmdColorModNeedsClan };
      }
      return { kind: "error", message: clanTxt.cmdColorLeaderOnly };
    }
    if (ledClans.length > 1) {
      return { kind: "error", message: clanTxt.cmdLeaderMultipleClans };
    }
    return { kind: "change_color", clanRole: ledClans[0], colorPreset: preset };
  }

  const resolved = resolveClanQuery(guild, clanQuery);
  if (isParseError(resolved)) return resolved;

  if (!isMod && !isClanLeaderFor(member, resolved.id)) {
    return { kind: "error", message: clanTxt.cmdColorNotYourClan(resolved.name) };
  }

  return { kind: "change_color", clanRole: resolved, colorPreset: preset };
}

export function isClanCommandMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  return (
    GRANT_PREFIX.test(trimmed) ||
    REMOVE_PREFIX.test(trimmed) ||
    GRANT_LEADER_PREFIX.test(trimmed) ||
    REMOVE_LEADER_PREFIX.test(trimmed) ||
    CREATE_HEADER.test(firstLine) ||
    ROSTER_PREFIX.test(trimmed) ||
    CHANGE_COLOR_PREFIX.test(trimmed)
  );
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
    return parseCreateCommand(guild, content, mentions, member.id);
  }

  if (GRANT_PREFIX.test(trimmed)) {
    const body = trimmed.replace(GRANT_PREFIX, "").trim();
    return parseGrantCommand(guild, member, body, mentions);
  }

  if (REMOVE_PREFIX.test(trimmed)) {
    const body = trimmed.replace(REMOVE_PREFIX, "").trim();
    return parseRemoveCommand(guild, member, body, mentions);
  }

  if (GRANT_LEADER_PREFIX.test(trimmed)) {
    const body = trimmed.replace(GRANT_LEADER_PREFIX, "").trim();
    return parseGrantLeaderCommand(guild, member, body, mentions);
  }

  if (REMOVE_LEADER_PREFIX.test(trimmed)) {
    const body = trimmed.replace(REMOVE_LEADER_PREFIX, "").trim();
    return parseRemoveLeaderCommand(guild, member, body, mentions);
  }

  if (ROSTER_PREFIX.test(trimmed)) {
    const body = trimmed.replace(ROSTER_PREFIX, "").trim();
    return parseRosterCommand(guild, member, body);
  }

  if (CHANGE_COLOR_PREFIX.test(trimmed)) {
    const body = trimmed.replace(CHANGE_COLOR_PREFIX, "").trim();
    return parseChangeColorCommand(guild, member, body);
  }

  return null;
}

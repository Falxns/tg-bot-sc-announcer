import {
  ChannelType,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  Role,
  TextChannel,
} from "discord.js";
import {
  DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID,
  DISCORD_CLAN_LEADER_ROLE_ID,
  DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID,
  DISCORD_CLAN_STAFF_LOG_CHANNEL_ID,
  DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID,
} from "../../config";
import { saveState } from "../../state";
import type { ClanCreateRequest } from "../types";
import { countClanLeaders, listClanRoles, memberLeadsAnyClan } from "./resolver";
import { clanTxt } from "./strings";

export type RoleActionResult = { ok: true } | { ok: false; error: string };

async function getBotMember(guild: Guild): Promise<GuildMember | null> {
  return guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
}

async function positionClanRoleAboveAnchor(guild: Guild, role: Role): Promise<void> {
  const anchorId = DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID;
  if (!anchorId) return;

  const anchor =
    guild.roles.cache.get(anchorId) ?? (await guild.roles.fetch(anchorId).catch(() => null));
  if (!anchor) {
    console.warn(`Clan role anchor ${anchorId} not found; skipping position for ${role.name}.`);
    return;
  }
  if (!role.editable) {
    console.warn(`Clan role ${role.name} is not editable by the bot; cannot place above anchor.`);
    return;
  }
  if (role.comparePositionTo(anchor) > 0) return;

  try {
    await role.setPosition(anchor.position + 1, {
      reason: `Clan role stacked above ${anchor.name}`,
    });
  } catch (err) {
    console.warn(`Failed to position clan role ${role.name} above anchor ${anchor.name}:`, err);
  }
}

function roleBlocker(me: GuildMember, target: GuildMember, role: Role): string | null {
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return clanTxt.noManageRoles;
  if (!target.manageable) return "Нельзя изменить роли этому участнику (иерархия).";
  if (role.managed) return "Эта роль управляется интеграцией.";
  if (!role.editable) return "Бот не может редактировать эту роль (позиция).";
  return null;
}

export async function grantClanRoleToMember(
  guild: Guild,
  target: GuildMember,
  clanRole: Role,
  grantLeaderMeta: boolean,
): Promise<RoleActionResult> {
  const me = await getBotMember(guild);
  if (!me) return { ok: false, error: clanTxt.noManageRoles };
  const blocker = roleBlocker(me, target, clanRole);
  if (blocker) return { ok: false, error: blocker };

  if (grantLeaderMeta) {
    if (countClanLeaders(guild, clanRole.id) >= 2 && !target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
      return { ok: false, error: clanTxt.grantLeaderCap(2) };
    }
  }

  try {
    if (!target.roles.cache.has(clanRole.id)) {
      await target.roles.add(clanRole.id);
    }
    if (grantLeaderMeta && DISCORD_CLAN_LEADER_ROLE_ID) {
      if (!target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
        await target.roles.add(DISCORD_CLAN_LEADER_ROLE_ID);
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }
}

export async function removeClanRoleFromMember(
  guild: Guild,
  target: GuildMember,
  clanRole: Role,
): Promise<RoleActionResult> {
  const me = await getBotMember(guild);
  if (!me) return { ok: false, error: clanTxt.noManageRoles };
  const blocker = roleBlocker(me, target, clanRole);
  if (blocker) return { ok: false, error: blocker };

  try {
    if (target.roles.cache.has(clanRole.id)) {
      await target.roles.remove(clanRole.id);
    }
    if (DISCORD_CLAN_LEADER_ROLE_ID && target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
      if (!memberLeadsAnyClan(guild, target)) {
        await target.roles.remove(DISCORD_CLAN_LEADER_ROLE_ID);
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }
}

export async function executeCreateRequest(
  guild: Guild,
  request: ClanCreateRequest,
): Promise<{ ok: true; role: Role } | { ok: false; error: string }> {
  const me = await getBotMember(guild);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: clanTxt.noManageRoles };
  }

  const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === request.clanName.toLowerCase());
  if (existing) return { ok: false, error: clanTxt.wizardNameDuplicate };

  let role: Role;
  try {
    role = await guild.roles.create({
      name: request.clanName,
      colors: { primaryColor: request.colorHex },
      reason: `Clan create request ${request.id}`,
    });
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }

  await positionClanRoleAboveAnchor(guild, role);

  const leaderMetaId = DISCORD_CLAN_LEADER_ROLE_ID;
  const leaderSet = new Set(request.leaderIds);

  for (const userId of request.memberIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const grantLeader = leaderSet.has(userId);
    const result = await grantClanRoleToMember(guild, member, role, grantLeader);
    if (!result.ok && grantLeader) {
      await grantClanRoleToMember(guild, member, role, false);
    }
  }

  if (leaderMetaId) {
    for (const userId of request.leaderIds) {
      if (countClanLeaders(guild, role.id) >= 2) break;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      if (!member.roles.cache.has(role.id)) continue;
      if (!member.roles.cache.has(leaderMetaId)) {
        await member.roles.add(leaderMetaId).catch(() => undefined);
      }
    }
  }

  return { ok: true, role };
}

export async function postClanAuditLine(guild: Guild, line: string): Promise<void> {
  const channelId =
    DISCORD_CLAN_STAFF_LOG_CHANNEL_ID ||
    DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID ||
    DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID;
  if (!channelId) return;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) return;
  await (ch as TextChannel).send({ content: line.slice(0, 2000) }).catch(() => undefined);
}

export async function persistClanState(statePath: string): Promise<void> {
  await saveState(statePath);
}

export function formatClansListEmbedLines(guild: Guild): string[] {
  const roles = listClanRoles(guild);
  if (roles.length === 0) return [clanTxt.clanslistEmpty];
  return roles.map((r) => {
    const leaders = countClanLeaders(guild, r.id);
    return clanTxt.clanslistLine(r.name, leaders, r.members.size);
  });
}

import {
  ChannelType,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  Role,
  TextChannel,
  type ForumChannel,
  type GuildBasedChannel,
  type NewsChannel,
} from "discord.js";
import {
  DISCORD_CLAN_CHAT_CHANNEL_ID,
  DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID,
  DISCORD_CLAN_LEADER_ROLE_ID,
  DISCORD_CLAN_ROLE_POSITION_ABOVE_ROLE_ID,
  DISCORD_CLAN_STAFF_LOG_CHANNEL_ID,
  DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID,
} from "../../config";
import {
  clanGrantRequests,
  clanLeaderMetaRequests,
  saveState,
} from "../../state";
import type { ClanCreateRequest } from "../types";
import { countClanLeaders, countMembersWithRole, ensureGuildMembersCached, getMemberClanRoleCapConflict, isClanLeaderFor, listClanRoles, listMemberClanRoles, listMemberIdsWithRole } from "./resolver";
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
    // discord.js setPosition uses sorted index; anchor.position matches that slot for the anchor role.
    await role.setPosition(anchor.position, {
      reason: `Clan role stacked above ${anchor.name}`,
    });
  } catch (err) {
    console.warn(`Failed to position clan role ${role.name} above anchor ${anchor.name}:`, err);
  }
}

type ClanChatChannel = TextChannel | NewsChannel | ForumChannel;

function resolveClanChatChannel(channel: GuildBasedChannel | null): ClanChatChannel | null {
  if (!channel) return null;
  if (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum
  ) {
    return channel;
  }
  return null;
}

/** Allow Send Messages for the clan role on the configured clan chat channel; other overwrite bits unchanged. */
async function grantClanRoleClanChatAccess(guild: Guild, role: Role): Promise<void> {
  const channelId = DISCORD_CLAN_CHAT_CHANNEL_ID;
  if (!channelId) return;

  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  const channel = resolveClanChatChannel(fetched);
  if (!channel) {
    console.warn(`Clan chat channel ${channelId} not found or unsupported; skipping overwrite for ${role.name}.`);
    return;
  }

  const me = await getBotMember(guild);
  if (!me) return;

  // Discord API: editing channel permission overwrites requires MANAGE_ROLES (UI: «Управление правами»).
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) &&
    !me.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    console.warn(
      `Bot needs Manage Roles on clan chat ${channelId} to set role overwrites (Manage Channel alone is not enough per Discord API).`,
    );
    return;
  }
  if (role.comparePositionTo(me.roles.highest) >= 0) {
    console.warn(
      `Bot's highest role must be above clan role ${role.name} to set channel overwrites on ${channelId}.`,
    );
    return;
  }

  const sendMessages = { SendMessages: true } as const;
  try {
    const existing = channel.permissionOverwrites.cache.get(role.id);
    if (existing) {
      await channel.permissionOverwrites.edit(role.id, sendMessages);
    } else {
      await channel.permissionOverwrites.create(role.id, sendMessages);
    }
  } catch (err) {
    console.warn(`Failed to set clan chat Send Messages for role ${role.name}:`, err);
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

  const capConflict = getMemberClanRoleCapConflict(guild, target, clanRole.id);
  if (capConflict) {
    return { ok: false, error: clanTxt.clanRoleCapTarget(capConflict.name) };
  }

  if (grantLeaderMeta) {
    if ((await countClanLeaders(guild, clanRole.id)) >= 2 && !target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
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

export async function grantLeaderMetaOnly(
  guild: Guild,
  target: GuildMember,
  clanRole: Role,
): Promise<RoleActionResult> {
  const me = await getBotMember(guild);
  if (!me) return { ok: false, error: clanTxt.noManageRoles };
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return { ok: false, error: clanTxt.leaderMetaNotConfigured };

  const leaderMeta = guild.roles.cache.get(DISCORD_CLAN_LEADER_ROLE_ID);
  if (!leaderMeta) return { ok: false, error: clanTxt.leaderMetaNotConfigured };

  if (!target.roles.cache.has(clanRole.id)) {
    return { ok: false, error: clanTxt.targetDoesNotHaveClanRole };
  }
  if (isClanLeaderFor(target, clanRole.id)) {
    return { ok: false, error: clanTxt.alreadyClanLeader };
  }

  const blocker = roleBlocker(me, target, leaderMeta);
  if (blocker) return { ok: false, error: blocker };

  if ((await countClanLeaders(guild, clanRole.id)) >= 2) {
    return { ok: false, error: clanTxt.grantLeaderCap(2) };
  }

  try {
    if (!target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
      await target.roles.add(DISCORD_CLAN_LEADER_ROLE_ID);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }
}

export async function removeLeaderMetaFromMember(
  guild: Guild,
  target: GuildMember,
  clanRole: Role,
): Promise<RoleActionResult> {
  const me = await getBotMember(guild);
  if (!me) return { ok: false, error: clanTxt.noManageRoles };
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return { ok: false, error: clanTxt.leaderMetaNotConfigured };

  if (!isClanLeaderFor(target, clanRole.id)) {
    return { ok: false, error: clanTxt.notClanLeader };
  }

  const ledClans = listMemberClanRoles(guild, target).filter((r) => isClanLeaderFor(target, r.id));
  if (ledClans.length > 1) {
    return { ok: false, error: clanTxt.cmdLeaderMultipleClans };
  }

  const leaderMeta = guild.roles.cache.get(DISCORD_CLAN_LEADER_ROLE_ID);
  if (!leaderMeta) return { ok: false, error: clanTxt.leaderMetaNotConfigured };

  const blocker = roleBlocker(me, target, leaderMeta);
  if (blocker) return { ok: false, error: blocker };

  try {
    if (target.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
      await target.roles.remove(DISCORD_CLAN_LEADER_ROLE_ID);
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
    const ledClanRoleIdsBefore = listMemberClanRoles(guild, target)
      .filter((r) => isClanLeaderFor(target, r.id))
      .map((r) => r.id);

    if (target.roles.cache.has(clanRole.id)) {
      await target.roles.remove(clanRole.id);
    }

    if (DISCORD_CLAN_LEADER_ROLE_ID) {
      const updated = await guild.members.fetch({ user: target.id, force: true }).catch(() => target);
      if (updated.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) {
        const remainingClanRoles = listMemberClanRoles(guild, updated).filter((r) => r.id !== clanRole.id);
        const stillLeadsAnotherClan = ledClanRoleIdsBefore
          .filter((id) => id !== clanRole.id)
          .some((id) => updated.roles.cache.has(id));

        if (remainingClanRoles.length === 0 || !stillLeadsAnotherClan) {
          const leaderMeta = guild.roles.cache.get(DISCORD_CLAN_LEADER_ROLE_ID);
          if (leaderMeta && !leaderMeta.editable) {
            console.warn(`Cannot remove leader meta-role ${DISCORD_CLAN_LEADER_ROLE_ID}: bot role too low.`);
          } else {
            await updated.roles.remove(DISCORD_CLAN_LEADER_ROLE_ID);
          }
        }
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
  if (existing) return { ok: false, error: clanTxt.createNameDuplicate };

  await ensureGuildMembersCached(guild);
  for (const userId of request.memberIds) {
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    const conflict = getMemberClanRoleCapConflict(guild, member);
    if (conflict) {
      return { ok: false, error: clanTxt.createMemberClanRoleCap(userId, conflict.name) };
    }
  }

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
  await grantClanRoleClanChatAccess(guild, role);

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
      if ((await countClanLeaders(guild, role.id)) >= 2) break;
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

export async function formatClansListEmbedLines(guild: Guild): Promise<string[]> {
  await ensureGuildMembersCached(guild);
  const roles = listClanRoles(guild);
  if (roles.length === 0) return [clanTxt.clanslistEmpty];
  const lines: string[] = [];
  for (const r of roles) {
    const leaders = await countClanLeaders(guild, r.id);
    lines.push(clanTxt.clanslistLine(r.name, leaders, countMembersWithRole(guild, r.id)));
  }
  return lines;
}

export type ClanPurgeReason = "understaffed" | "leaderless";

function purgePendingRequestsForClanRole(clanRoleId: string): void {
  for (const [id, req] of clanGrantRequests) {
    if (req.clanRoleId === clanRoleId && req.status === "pending") {
      clanGrantRequests.delete(id);
    }
  }
  for (const [id, req] of clanLeaderMetaRequests) {
    if (
      req.clanRoleId === clanRoleId &&
      (req.status === "pending_clan_leader" || req.status === "pending_mod")
    ) {
      clanLeaderMetaRequests.delete(id);
    }
  }
}

/** Remove a clan role from all members, cancel pending requests, and delete the Discord role. */
export async function purgeClanRole(
  guild: Guild,
  clanRole: Role,
  reason: ClanPurgeReason,
): Promise<RoleActionResult> {
  const me = await getBotMember(guild);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, error: clanTxt.noManageRoles };
  }
  if (!clanRole.editable) {
    return { ok: false, error: "Бот не может удалить эту роль (позиция в иерархии)." };
  }

  await ensureGuildMembersCached(guild);
  const memberIds = listMemberIdsWithRole(guild, clanRole.id);

  for (const userId of memberIds) {
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    await removeClanRoleFromMember(guild, member, clanRole);
  }

  purgePendingRequestsForClanRole(clanRole.id);

  try {
    await clanRole.delete(`Clan enforcement: ${reason}`);
  } catch {
    return { ok: false, error: clanTxt.noManageRoles };
  }

  const auditLine =
    reason === "understaffed"
      ? clanTxt.auditEnforcementUnderstaffed(clanRole.name)
      : clanTxt.auditEnforcementLeaderless(clanRole.name);
  await postClanAuditLine(guild, auditLine);

  return { ok: true };
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Role,
} from "discord.js";
import { LAST_SEEN_STATE_FILE } from "../../config";
import {
  deleteClanRecruiterMetaRequest,
  getClanRecruiterMetaRequest,
  saveState,
  setClanRecruiterMetaRequest,
} from "../../state";
import type { ClanRecruiterMetaRequest } from "../types";
import { grantRecruiterMetaOnly, postClanAuditLine, removeRecruiterMetaFromMember } from "./actions";
import { CLAN_RECRUITER_META_PREFIX, MAX_CLAN_RECRUITERS } from "./constants";
import { newClanRequestId, sendInClanChannel } from "./helpers";
import { clearClanPendingEmbed, notifyClanRequestOutcome } from "./notifications";
import {
  canApproveRecruiterRequest,
  canGrantRecruiterDirect,
  canRemoveRecruiterMeta,
  clanApprovalOutcomeMentionIds,
} from "./permissions";
import {
  countClanRecruiters,
  ensureGuildMembersCached,
  isClanLeaderFor,
  isClanRecruiterFor,
  listClanLeaderIds,
} from "./resolver";
import { clanTxt } from "./strings";

export function isClanRecruiterMetaCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_RECRUITER_META_PREFIX);
}

async function postPendingRecruiterApproval(
  guild: Guild,
  dest: GuildTextBasedChannel,
  request: ClanRecruiterMetaRequest,
): Promise<boolean> {
  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);

  const leaderIdsToPing = (await listClanLeaderIds(guild, request.clanRoleId)).filter(
    (id) => id !== request.targetUserId,
  );
  const pingContent =
    leaderIdsToPing.length > 0
      ? clanTxt.pendingRecruiterPing(leaderIdsToPing.map((id) => `<@${id}>`).join(" "))
      : undefined;

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.pendingRecruiterTitle)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Кандидат в рекрутеры:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}\n\n` +
        clanTxt.pendingRecruiterNote,
    )
    .setColor(0xfee75c)
    .setTimestamp(request.createdAt);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLAN_RECRUITER_META_PREFIX}approve:${request.id}`)
      .setLabel(clanTxt.approve)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CLAN_RECRUITER_META_PREFIX}deny:${request.id}`)
      .setLabel(clanTxt.deny)
      .setStyle(ButtonStyle.Danger),
  );

  const msg = await sendInClanChannel(
    dest,
    {
      ...(pingContent ? { content: pingContent } : {}),
      embeds: [embed],
      components: [row],
      ...(leaderIdsToPing.length > 0 ? { allowedMentions: { users: leaderIdsToPing } } : {}),
    },
    request.sourceMessageId,
  );
  if (msg) {
    request.pendingMessageId = msg.id;
    request.channelId = dest.id;
    request.threadId = dest.id;
    setClanRecruiterMetaRequest(request);
    await saveState(LAST_SEEN_STATE_FILE);
    return true;
  }
  return false;
}

export async function submitRecruiterMetaGrantRequest(
  guild: Guild,
  dest: GuildTextBasedChannel,
  requesterId: string,
  clanRole: Role,
  targetUserId: string,
  sourceMessageId?: string,
): Promise<string | null> {
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return clanTxt.targetMissing;
  if (!target.roles.cache.has(clanRole.id)) {
    return requesterId === targetUserId
      ? clanTxt.recruiterMetaNeedsClanFirstSelf(clanRole.name)
      : clanTxt.recruiterMetaNeedsClanFirstTarget(clanRole.name);
  }
  if (isClanLeaderFor(target, clanRole.id)) return clanTxt.leaderCannotBeRecruiter;
  if (isClanRecruiterFor(target, clanRole.id)) return clanTxt.alreadyClanRecruiter;

  await ensureGuildMembersCached(guild);
  if ((await countClanRecruiters(guild, clanRole.id)) >= MAX_CLAN_RECRUITERS) {
    return clanTxt.grantRecruiterCap(MAX_CLAN_RECRUITERS);
  }

  const requester = await guild.members.fetch(requesterId).catch(() => null);
  if (requester && canGrantRecruiterDirect(requester, clanRole.id)) {
    const result = await grantRecruiterMetaOnly(guild, target, clanRole);
    if (!result.ok) return result.error;
    await notifyClanRequestOutcome(
      guild,
      dest.id,
      sourceMessageId,
      clanTxt.recruiterMetaGrantedDirect(clanRole.name, targetUserId),
      clanApprovalOutcomeMentionIds(
        { requesterUserId: requesterId, targetUserId },
        requester,
      ),
    );
    await postClanAuditLine(
      guild,
      clanTxt.auditGrantRecruiterMeta(requester.toString(), target.toString(), clanRole.name),
    );
    return null;
  }

  const request: ClanRecruiterMetaRequest = {
    id: newClanRequestId(),
    guildId: guild.id,
    clanRoleId: clanRole.id,
    clanRoleName: clanRole.name,
    targetUserId,
    requesterUserId: requesterId,
    status: "pending",
    threadId: dest.id,
    channelId: dest.id,
    sourceMessageId,
    createdAt: Date.now(),
  };

  setClanRecruiterMetaRequest(request);
  await saveState(LAST_SEEN_STATE_FILE);
  const posted = await postPendingRecruiterApproval(guild, dest, request);
  if (!posted) return clanTxt.leaderMetaApprovalPostFailed;
  return null;
}

export async function performDirectRecruiterMetaRemove(
  guild: Guild,
  actor: GuildMember,
  role: Role,
  targetUserId: string,
): Promise<{ ok: true; target: GuildMember } | { ok: false; error: string }> {
  if (!canRemoveRecruiterMeta(actor, role.id, targetUserId)) {
    return { ok: false, error: clanTxt.cannotApprove };
  }
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return { ok: false, error: clanTxt.targetMissing };
  const result = await removeRecruiterMetaFromMember(guild, target, role);
  if (!result.ok) return { ok: false, error: result.error };
  await postClanAuditLine(
    guild,
    clanTxt.auditRemoveRecruiterMeta(actor.toString(), target.toString(), role.name),
  );
  return { ok: true, target };
}

export async function handleClanRecruiterMetaButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!isClanRecruiterMetaCustomId(interaction.customId)) return false;

  const parts = interaction.customId.slice(CLAN_RECRUITER_META_PREFIX.length).split(":");
  const action = parts[0];
  const requestId = parts[1];
  const request = getClanRecruiterMetaRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.requestUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (request.status !== "pending") {
    await interaction.reply({ content: clanTxt.alreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (!canApproveRecruiterRequest(member, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  if (action === "deny") {
    request.status = "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = member.id;
    setClanRecruiterMetaRequest(request);
    await clearClanPendingEmbed(interaction.message, interaction.guild, request.channelId);
    await notifyClanRequestOutcome(
      interaction.guild,
      request.channelId,
      request.sourceMessageId,
      clanTxt.recruiterMetaDeniedReply(request.clanRoleName),
      [request.requesterUserId],
    );
    await saveState(LAST_SEEN_STATE_FILE);
    setTimeout(() => deleteClanRecruiterMetaRequest(requestId), 60_000);
    return true;
  }

  if ((await countClanRecruiters(interaction.guild, request.clanRoleId)) >= MAX_CLAN_RECRUITERS) {
    await interaction.followUp({
      content: clanTxt.grantRecruiterCap(MAX_CLAN_RECRUITERS),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const clanRole = await interaction.guild.roles.fetch(request.clanRoleId).catch(() => null);
  const target = await interaction.guild.members.fetch(request.targetUserId).catch(() => null);
  if (!clanRole || !target) {
    await interaction.followUp({ content: clanTxt.targetMissing, flags: MessageFlags.Ephemeral });
    return true;
  }

  const result = await grantRecruiterMetaOnly(interaction.guild, target, clanRole);
  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return true;
  }

  request.status = "approved";
  request.resolvedAt = Date.now();
  request.resolvedBy = member.id;
  setClanRecruiterMetaRequest(request);
  await clearClanPendingEmbed(interaction.message, interaction.guild, request.channelId);
  await notifyClanRequestOutcome(
    interaction.guild,
    request.channelId,
    request.sourceMessageId,
    clanTxt.recruiterMetaApprovedReply(
      request.clanRoleName,
      request.targetUserId,
      request.requesterUserId,
    ),
    clanApprovalOutcomeMentionIds(request, member),
  );
  await saveState(LAST_SEEN_STATE_FILE);
  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditGrantRecruiterMeta(member.toString(), target.toString(), request.clanRoleName),
  );
  setTimeout(() => deleteClanRecruiterMetaRequest(requestId), 60_000);
  return true;
}

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
  deleteClanGrantRequest,
  getClanGrantRequest,
  saveState,
  setClanGrantRequest,
} from "../../state";
import type { ClanGrantRequest } from "../types";
import { grantClanRoleToMember, postClanAuditLine, removeClanRoleFromMember } from "./actions";
import { CLAN_REQ_PREFIX, MAX_CLAN_LEADERS } from "./constants";
import { newClanRequestId, sendInClanChannel } from "./helpers";
import { clearClanPendingEmbed, notifyClanRequestOutcome } from "./notifications";
import { canApproveGrantRequest, clanGrantApprovalMentionIds, isClanModerator } from "./permissions";
import {
  countClanLeaders,
  getMemberClanRoleCapConflict,
  isClanLeaderFor,
  isClanStaffFor,
  listClanLeaderIds,
  listClanRecruiterIds,
} from "./resolver";
import { clanTxt } from "./strings";

export function isClanGrantCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_REQ_PREFIX);
}

export async function postPendingGrantRequest(
  guild: Guild,
  dest: GuildTextBasedChannel,
  request: ClanGrantRequest,
): Promise<void> {
  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);

  let pingContent: string | undefined;
  let staffIdsToPing: string[] = [];
  if (request.type === "grant") {
    const leaderIds = await listClanLeaderIds(guild, request.clanRoleId);
    const recruiterIds = await listClanRecruiterIds(guild, request.clanRoleId);
    staffIdsToPing = [...new Set([...leaderIds, ...recruiterIds])].filter(
      (id) => id !== request.requesterUserId,
    );
    if (staffIdsToPing.length > 0) {
      pingContent = clanTxt.pendingGrantStaffPing(staffIdsToPing.map((id) => `<@${id}>`).join(" "));
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.pendingGrantTitle)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Участник:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}`,
    )
    .setColor(0x57f287)
    .setTimestamp(request.createdAt);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLAN_REQ_PREFIX}approve:${request.id}`)
      .setLabel(clanTxt.approve)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CLAN_REQ_PREFIX}deny:${request.id}`)
      .setLabel(clanTxt.deny)
      .setStyle(ButtonStyle.Danger),
  );

  const msg = await sendInClanChannel(
    dest,
    {
      ...(pingContent ? { content: pingContent } : {}),
      embeds: [embed],
      components: [row],
      ...(staffIdsToPing.length > 0 ? { allowedMentions: { users: staffIdsToPing } } : {}),
    },
    request.sourceMessageId,
  );
  if (msg) {
    request.pendingMessageId = msg.id;
    request.threadId = dest.isThread() ? dest.id : undefined;
    request.channelId = dest.id;
    setClanGrantRequest(request);
    await saveState(LAST_SEEN_STATE_FILE);
  }
}

export async function submitGrantRequest(
  guild: Guild,
  dest: GuildTextBasedChannel,
  requesterId: string,
  clanRole: Role,
  targetUserId: string,
  grantLeaderMeta = false,
  sourceMessageId?: string,
): Promise<string | null> {
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return clanTxt.targetMissing;
  const capConflict = getMemberClanRoleCapConflict(guild, target, clanRole.id);
  if (capConflict) {
    return requesterId === targetUserId
      ? clanTxt.clanRoleCapSelf(capConflict.name)
      : clanTxt.clanRoleCapTarget(capConflict.name);
  }

  const requester = await guild.members.fetch(requesterId).catch(() => null);
  if (
    !grantLeaderMeta &&
    requester &&
    targetUserId !== requesterId &&
    (isClanModerator(requester) || isClanStaffFor(requester, clanRole.id))
  ) {
    const result = await grantClanRoleToMember(guild, target, clanRole, false);
    if (!result.ok) return result.error;

    await notifyClanRequestOutcome(
      guild,
      dest.id,
      sourceMessageId,
      clanTxt.grantDirectToTarget(clanRole.name),
      await clanGrantApprovalMentionIds(
        guild,
        { requesterUserId: requesterId, targetUserId, clanRoleId: clanRole.id },
        requester,
      ),
    );
    await postClanAuditLine(
      guild,
      clanTxt.auditGrant(requester.toString(), target.toString(), clanRole.name),
    );
    return null;
  }

  const request: ClanGrantRequest = {
    id: newClanRequestId(),
    guildId: guild.id,
    channelId: dest.id,
    clanRoleId: clanRole.id,
    clanRoleName: clanRole.name,
    targetUserId,
    requesterUserId: requesterId,
    type: "grant",
    grantLeaderMeta,
    status: "pending",
    sourceMessageId,
    createdAt: Date.now(),
  };
  await postPendingGrantRequest(guild, dest, request);
  if (!request.pendingMessageId) {
    return clanTxt.leaderMetaApprovalPostFailed;
  }
  return null;
}

export async function performDirectRemove(
  guild: Guild,
  actor: GuildMember,
  role: Role,
  targetUserId: string,
): Promise<{ ok: true; target: GuildMember } | { ok: false; error: string }> {
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return { ok: false, error: clanTxt.targetMissing };
  if (!target.roles.cache.has(role.id)) {
    return { ok: false, error: clanTxt.targetDoesNotHaveClanRole };
  }
  if (
    !isClanModerator(actor) &&
    targetUserId !== actor.id &&
    isClanLeaderFor(target, role.id)
  ) {
    return { ok: false, error: clanTxt.cmdLeaderRemoveClanRoleFromLeader };
  }
  const result = await removeClanRoleFromMember(guild, target, role);
  if (!result.ok) return { ok: false, error: result.error };
  await postClanAuditLine(guild, clanTxt.auditRemoveDirect(actor.toString(), target.toString(), role.name));
  return { ok: true, target };
}

export async function handleClanGrantButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!isClanGrantCustomId(interaction.customId)) return false;

  const parts = interaction.customId.slice(CLAN_REQ_PREFIX.length).split(":");
  const action = parts[0];
  const requestId = parts[1];
  const request = getClanGrantRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.requestUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (request.status !== "pending") {
    await interaction.reply({ content: clanTxt.alreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (!canApproveGrantRequest(member, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  if (action === "deny") {
    request.status = "denied";
    setClanGrantRequest(request);
    await clearClanPendingEmbed(interaction.message, interaction.guild, request.channelId);
    await notifyClanRequestOutcome(
      interaction.guild,
      request.channelId,
      request.sourceMessageId,
      clanTxt.grantDeniedReply(request.clanRoleName),
      [request.requesterUserId],
    );
    await saveState(LAST_SEEN_STATE_FILE);
    return true;
  }

  const clanRole = await interaction.guild.roles.fetch(request.clanRoleId).catch(() => null);
  const target = await interaction.guild.members.fetch(request.targetUserId).catch(() => null);
  if (!clanRole || !target) {
    await interaction.followUp({ content: clanTxt.targetMissing, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (request.grantLeaderMeta && (await countClanLeaders(interaction.guild, request.clanRoleId)) >= MAX_CLAN_LEADERS) {
    await interaction.followUp({ content: clanTxt.grantLeaderCap(MAX_CLAN_LEADERS), flags: MessageFlags.Ephemeral });
    return true;
  }

  const result = await grantClanRoleToMember(interaction.guild, target, clanRole, request.grantLeaderMeta);
  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return true;
  }

  request.status = "approved";
  setClanGrantRequest(request);
  await clearClanPendingEmbed(interaction.message, interaction.guild, request.channelId);
  await notifyClanRequestOutcome(
    interaction.guild,
    request.channelId,
    request.sourceMessageId,
    clanTxt.grantApprovedReply(request.clanRoleName, request.targetUserId, request.requesterUserId),
    await clanGrantApprovalMentionIds(interaction.guild, request, member),
  );
  await saveState(LAST_SEEN_STATE_FILE);

  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditGrant(member.toString(), target.toString(), request.clanRoleName),
  );

  setTimeout(() => deleteClanGrantRequest(requestId), 60_000);
  return true;
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type Role,
  type TextChannel,
} from "discord.js";
import { DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID, LAST_SEEN_STATE_FILE } from "../../config";
import {
  deleteClanLeaderMetaRequest,
  getClanLeaderMetaRequest,
  saveState,
  setClanLeaderMetaRequest,
} from "../../state";
import type { ClanLeaderMetaRequest } from "../types";
import { grantLeaderMetaOnly, postClanAuditLine, removeLeaderMetaFromMember } from "./actions";
import {
  CLAN_LEADER_META_PREFIX,
  CLAN_MOD_LEADER_META_PREFIX,
  MAX_CLAN_LEADERS,
} from "./constants";
import { newClanRequestId, replyToClanRequestMessage } from "./helpers";
import {
  canApproveLeaderMetaClanStage,
  canResolveLeaderMetaModRequest,
  isClanModerator,
} from "./permissions";
import { countClanLeaders, isClanLeaderFor, listClanLeaderIds } from "./resolver";
import { clanTxt } from "./strings";

export function isClanLeaderMetaClanCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_LEADER_META_PREFIX);
}

function modAcceptId(requestId: string): string {
  return `${CLAN_MOD_LEADER_META_PREFIX}accept:${requestId}`;
}

function modDenyId(requestId: string): string {
  return `${CLAN_MOD_LEADER_META_PREFIX}deny:${requestId}`;
}

async function finalizeClanLeaderStageMessage(
  message: Message,
  approved: boolean,
  resolver: GuildMember,
): Promise<void> {
  const existing = message.embeds[0];
  if (!existing) {
    await message.edit({ components: [] }).catch(() => undefined);
    return;
  }
  const baseDescription = existing.description ?? "";
  const statusLine = clanTxt.leaderMetaClanResolvedLine(approved, resolver.id);
  const embed = EmbedBuilder.from(existing)
    .setDescription(`${baseDescription}${statusLine}`)
    .setColor(approved ? 0x57f287 : 0x747f8d);
  await message.edit({
    embeds: [embed],
    components: [],
    allowedMentions: { users: [resolver.id] },
  }).catch(() => undefined);
}

async function postPendingClanLeaderApproval(
  guild: Guild,
  dest: GuildTextBasedChannel,
  request: ClanLeaderMetaRequest,
): Promise<void> {
  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);

  const leaderIdsToPing = (await listClanLeaderIds(guild, request.clanRoleId)).filter(
    (id) => id !== request.targetUserId,
  );
  const pingContent =
    leaderIdsToPing.length > 0
      ? clanTxt.pendingLeaderMetaClanPing(leaderIdsToPing.map((id) => `<@${id}>`).join(" "))
      : undefined;

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.pendingLeaderMetaTitle)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Кандидат в лидеры:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}\n\n` +
        clanTxt.pendingLeaderMetaClanNote,
    )
    .setColor(0xfee75c)
    .setTimestamp(request.createdAt);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLAN_LEADER_META_PREFIX}approve:${request.id}`)
      .setLabel(clanTxt.approve)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CLAN_LEADER_META_PREFIX}deny:${request.id}`)
      .setLabel(clanTxt.deny)
      .setStyle(ButtonStyle.Danger),
  );

  const msg = await dest
    .send({
      content: pingContent,
      embeds: [embed],
      components: [row],
      allowedMentions:
        leaderIdsToPing.length > 0 ? { parse: ["users"], users: leaderIdsToPing } : undefined,
    })
    .catch(() => null);
  if (msg) {
    request.pendingMessageId = msg.id;
    request.channelId = dest.id;
    request.threadId = dest.isThread() ? dest.id : dest.id;
    setClanLeaderMetaRequest(request);
    await saveState(LAST_SEEN_STATE_FILE);
  }
}

async function postLeaderMetaToModQueue(
  guild: Guild,
  request: ClanLeaderMetaRequest,
): Promise<string | null> {
  if (!DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID) return clanTxt.modReviewChannelMissing;

  const reviewChannel = await guild.channels
    .fetch(DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID)
    .catch(() => null);
  if (
    !reviewChannel ||
    (reviewChannel.type !== ChannelType.GuildText && reviewChannel.type !== ChannelType.GuildAnnouncement)
  ) {
    return clanTxt.modReviewChannelMissing;
  }

  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);
  const approverLine = request.clanLeaderApprovedBy
    ? `\n**Подтвердил лидер:** <@${request.clanLeaderApprovedBy}>`
    : "";

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.modLeaderMetaTitle)
    .setColor(0xfee75c)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Кандидат:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}\n` +
        `**Источник:** <#${request.threadId}>${approverLine}`,
    )
    .setFooter({ text: clanTxt.modLeaderMetaReminder })
    .setTimestamp(request.createdAt);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(modAcceptId(request.id))
      .setLabel(clanTxt.modAccept)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(modDenyId(request.id))
      .setLabel(clanTxt.modDeny)
      .setStyle(ButtonStyle.Danger),
  );

  const msg = await (reviewChannel as TextChannel).send({ embeds: [embed], components: [row] });
  request.reviewMessageId = msg.id;
  request.reviewChannelId = reviewChannel.id;
  request.status = "pending_mod";
  setClanLeaderMetaRequest(request);
  await saveState(LAST_SEEN_STATE_FILE);
  return null;
}

export async function submitLeaderMetaGrantRequest(
  guild: Guild,
  dest: GuildTextBasedChannel,
  requesterId: string,
  clanRole: Role,
  targetUserId: string,
  sourceMessageId?: string,
): Promise<string | null> {
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return clanTxt.targetMissing;
  if (!target.roles.cache.has(clanRole.id)) return clanTxt.targetDoesNotHaveClanRole;
  if (isClanLeaderFor(target, clanRole.id)) return clanTxt.alreadyClanLeader;

  const leaderCount = await countClanLeaders(guild, clanRole.id);
  if (leaderCount >= MAX_CLAN_LEADERS) {
    return clanTxt.grantLeaderCap(MAX_CLAN_LEADERS);
  }

  const request: ClanLeaderMetaRequest = {
    id: newClanRequestId(),
    guildId: guild.id,
    clanRoleId: clanRole.id,
    clanRoleName: clanRole.name,
    targetUserId,
    requesterUserId: requesterId,
    status: leaderCount === 1 ? "pending_clan_leader" : "pending_mod",
    threadId: dest.id,
    channelId: dest.id,
    sourceMessageId,
    createdAt: Date.now(),
  };
  setClanLeaderMetaRequest(request);
  await saveState(LAST_SEEN_STATE_FILE);

  if (leaderCount === 1) {
    await postPendingClanLeaderApproval(guild, dest, request);
    return null;
  }

  return postLeaderMetaToModQueue(guild, request);
}

export async function performDirectLeaderMetaRemove(
  guild: Guild,
  actor: GuildMember,
  role: Role,
  targetUserId: string,
): Promise<{ ok: true; target: GuildMember } | { ok: false; error: string }> {
  if (!isClanModerator(actor) && actor.id !== targetUserId) {
    return { ok: false, error: clanTxt.cmdLeaderRemoveLeaderSelfOnly };
  }
  const target = await guild.members.fetch(targetUserId).catch(() => null);
  if (!target) return { ok: false, error: clanTxt.targetMissing };
  const result = await removeLeaderMetaFromMember(guild, target, role);
  if (!result.ok) return { ok: false, error: result.error };
  await postClanAuditLine(
    guild,
    clanTxt.auditRemoveLeaderMeta(actor.toString(), target.toString(), role.name),
  );
  return { ok: true, target };
}

export async function handleClanLeaderMetaClanButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!isClanLeaderMetaClanCustomId(interaction.customId)) return false;

  const parts = interaction.customId.slice(CLAN_LEADER_META_PREFIX.length).split(":");
  const action = parts[0];
  const requestId = parts[1];
  const request = getClanLeaderMetaRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.requestUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (request.status !== "pending_clan_leader") {
    await interaction.reply({ content: clanTxt.alreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (!canApproveLeaderMetaClanStage(member, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  if (action === "deny") {
    request.status = "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = member.id;
    setClanLeaderMetaRequest(request);
    await finalizeClanLeaderStageMessage(interaction.message, false, member);
    await replyToClanRequestMessage(
      interaction.guild,
      request.channelId,
      request.sourceMessageId,
      clanTxt.leaderMetaClanDeniedReply(request.clanRoleName),
    );
    await saveState(LAST_SEEN_STATE_FILE);
    setTimeout(() => deleteClanLeaderMetaRequest(requestId), 60_000);
    return true;
  }

  if ((await countClanLeaders(interaction.guild, request.clanRoleId)) >= MAX_CLAN_LEADERS) {
    await interaction.followUp({
      content: clanTxt.grantLeaderCap(MAX_CLAN_LEADERS),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  request.clanLeaderApprovedBy = member.id;
  setClanLeaderMetaRequest(request);
  await finalizeClanLeaderStageMessage(interaction.message, true, member);
  await saveState(LAST_SEEN_STATE_FILE);

  const modErr = await postLeaderMetaToModQueue(interaction.guild, request);
  if (modErr) {
    await interaction.followUp({ content: modErr, flags: MessageFlags.Ephemeral });
    return true;
  }

  await replyToClanRequestMessage(
    interaction.guild,
    request.channelId,
    request.sourceMessageId,
    clanTxt.leaderMetaSentToMod,
  );

  return true;
}

export async function handleClanLeaderMetaModButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const { customId } = interaction;
  if (!customId.startsWith(CLAN_MOD_LEADER_META_PREFIX)) return false;

  const suffix = customId.slice(CLAN_MOD_LEADER_META_PREFIX.length);
  const colonIdx = suffix.indexOf(":");
  if (colonIdx < 0) return false;
  const action = suffix.slice(0, colonIdx);
  const requestId = suffix.slice(colonIdx + 1);
  const request = getClanLeaderMetaRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.requestUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (request.status !== "pending_mod") {
    await interaction.reply({ content: clanTxt.modAlreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (!canResolveLeaderMetaModRequest(member, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  if (action === "deny") {
    request.status = "denied";
    request.resolvedAt = Date.now();
    request.resolvedBy = member.id;
    setClanLeaderMetaRequest(request);
    await interaction.message.edit({ components: [] }).catch(() => undefined);
    await saveState(LAST_SEEN_STATE_FILE);

    await replyToClanRequestMessage(
      interaction.guild,
      request.channelId,
      request.sourceMessageId,
      clanTxt.leaderMetaDeniedApplicant(),
    );
    await postClanAuditLine(
      interaction.guild,
      clanTxt.auditDenyLeaderMeta(member.toString(), request.clanRoleName, request.targetUserId),
    );
    setTimeout(() => deleteClanLeaderMetaRequest(requestId), 60_000);
    return true;
  }

  if (action !== "accept") return false;

  const clanRole = await interaction.guild.roles.fetch(request.clanRoleId).catch(() => null);
  const target = await interaction.guild.members.fetch(request.targetUserId).catch(() => null);
  if (!clanRole || !target) {
    await interaction.followUp({ content: clanTxt.targetMissing, flags: MessageFlags.Ephemeral });
    return true;
  }

  const result = await grantLeaderMetaOnly(interaction.guild, target, clanRole);
  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return true;
  }

  request.status = "approved";
  request.resolvedAt = Date.now();
  request.resolvedBy = member.id;
  setClanLeaderMetaRequest(request);
  await interaction.message.edit({ components: [] }).catch(() => undefined);
  await saveState(LAST_SEEN_STATE_FILE);

  await replyToClanRequestMessage(
    interaction.guild,
    request.channelId,
    request.sourceMessageId,
    clanTxt.leaderMetaApprovedApplicant(request.clanRoleName, target.id),
    [target.id],
  );

  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditGrantLeaderMeta(member.toString(), target.toString(), request.clanRoleName),
  );
  setTimeout(() => deleteClanLeaderMetaRequest(requestId), 60_000);
  return true;
}

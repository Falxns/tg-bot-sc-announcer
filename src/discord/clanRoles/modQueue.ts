import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import {
  DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID,
  LAST_SEEN_STATE_FILE,
} from "../../config";
import { getClanCreateRequest, saveState, setClanCreateRequest } from "../../state";
import type { ClanCreateRequest } from "../types";
import { executeCreateRequest, postClanAuditLine } from "./actions";
import { CLAN_MOD_PREFIX } from "./constants";
import { formatUserList, newClanRequestId, sendInClanChannel } from "./helpers";
import { deleteClanThreadMessage, notifyClanRequestOutcome } from "./notifications";
import { handleClanLeaderMetaModButton } from "./leaderMeta";
import { markModReviewMessageResolved } from "./modReviewEmbed";
import { canResolveCreateRequest } from "./permissions";
import { clanTxt } from "./strings";
import type { ParsedCreateCommand } from "./textCommands";
import {
  assertModeratorQuotaInteraction,
  isModeratorQuotaExempt,
  recordModeratorQuotaUse,
} from "../moderatorQuota";

function modAcceptId(requestId: string): string {
  return `${CLAN_MOD_PREFIX}accept:${requestId}`;
}

function modDenyId(requestId: string): string {
  return `${CLAN_MOD_PREFIX}deny:${requestId}`;
}

function modDenyModalId(requestId: string): string {
  return `${CLAN_MOD_PREFIX}deny_modal:${requestId}`;
}

export function isClanModCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_MOD_PREFIX);
}

async function postCreateRequestToModQueue(
  guild: Guild,
  request: ClanCreateRequest,
  memberIds: string[],
  leaderIds: string[],
): Promise<string | null> {
  if (!DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID) return clanTxt.modReviewChannelMissing;

  const reviewChannel = await guild.channels.fetch(DISCORD_CLAN_CREATE_REVIEW_CHANNEL_ID).catch(() => null);
  if (!reviewChannel || (reviewChannel.type !== ChannelType.GuildText && reviewChannel.type !== ChannelType.GuildAnnouncement)) {
    return clanTxt.modReviewChannelMissing;
  }

  const applicant = await guild.members.fetch(request.applicantId).catch(() => null);
  const leaderSet = new Set(leaderIds);
  const embed = new EmbedBuilder()
    .setTitle(clanTxt.modCreateTitle)
    .setColor(request.colorHex)
    .setDescription(
      `**Заявитель:** ${applicant ?? `<@${request.applicantId}>`}\n` +
        `**Клан:** ${request.clanName}\n` +
        `**Ранг:** ${request.clanTier ?? "—"}\n` +
        `**Цвет:** ${request.colorLabel}\n` +
        `**Состав:** ${memberIds.length} (лидеров: ${leaderIds.length})\n` +
        `**Источник:** <#${request.threadId}>`,
    )
    .addFields({
      name: "Участники",
      value: formatUserList(guild, memberIds, leaderSet).slice(0, 1024),
    })
    .setFooter({ text: clanTxt.modCreateReminder })
    .setTimestamp(request.createdAt);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(modAcceptId(request.id)).setLabel(clanTxt.modAccept).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(modDenyId(request.id)).setLabel(clanTxt.modDeny).setStyle(ButtonStyle.Danger),
  );

  const msg = await (reviewChannel as TextChannel).send({ embeds: [embed], components: [row] });
  request.reviewMessageId = msg.id;
  request.reviewChannelId = reviewChannel.id;
  setClanCreateRequest(request);
  await saveState(LAST_SEEN_STATE_FILE);
  return null;
}

async function postCreatePendingThreadNotice(
  guild: Guild,
  request: ClanCreateRequest,
): Promise<void> {
  const thread = await guild.channels.fetch(request.threadId).catch(() => null);
  if (!thread?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.pendingCreateThreadTitle)
    .setDescription(clanTxt.pendingCreateThreadBody(request.clanName))
    .setColor(request.colorHex)
    .setTimestamp(request.createdAt);

  const msg = await sendInClanChannel(
    thread as GuildTextBasedChannel,
    { embeds: [embed] },
    request.sourceMessageId,
  );
  if (msg) {
    request.threadPendingMessageId = msg.id;
    setClanCreateRequest(request);
    await saveState(LAST_SEEN_STATE_FILE);
  }
}

export async function submitCreateRequestFromText(
  guild: Guild,
  applicantId: string,
  sourceChannelId: string,
  parsed: ParsedCreateCommand,
  sourceMessageId?: string,
): Promise<string | null> {
  const request: ClanCreateRequest = {
    id: newClanRequestId(),
    guildId: guild.id,
    applicantId,
    threadId: sourceChannelId,
    sourceMessageId,
    clanName: parsed.clanName,
    clanTier: parsed.clanTier,
    colorHex: parsed.colorPreset.hex,
    colorLabel: parsed.colorPreset.label,
    memberIds: parsed.memberIds,
    leaderIds: parsed.leaderIds,
    status: "pending",
    createdAt: Date.now(),
  };
  setClanCreateRequest(request);
  const err = await postCreateRequestToModQueue(guild, request, parsed.memberIds, parsed.leaderIds);
  if (err) return err;
  await postCreatePendingThreadNotice(guild, request);
  return null;
}

export async function handleClanModButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const { customId } = interaction;
  if (!customId.startsWith(CLAN_MOD_PREFIX)) return false;

  if (await handleClanLeaderMetaModButton(interaction)) return true;

  if (customId.startsWith(`${CLAN_MOD_PREFIX}deny:`) && !customId.includes("deny_modal")) {
    const requestId = customId.slice(`${CLAN_MOD_PREFIX}deny:`.length);
    const request = getClanCreateRequest(requestId);
    if (!request || request.status !== "pending") {
      await interaction.reply({ content: clanTxt.modAlreadyResolved, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!canResolveCreateRequest(interaction.member as import("discord.js").GuildMember, request)) {
      await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!(await assertModeratorQuotaInteraction(interaction))) return true;

    const modal = new ModalBuilder().setCustomId(modDenyModalId(requestId)).setTitle(clanTxt.modDenyModalTitle);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel(clanTxt.modDenyReasonLabel)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (!customId.startsWith(`${CLAN_MOD_PREFIX}accept:`)) return false;

  const requestId = customId.slice(`${CLAN_MOD_PREFIX}accept:`.length);
  const request = getClanCreateRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.requestUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (request.status !== "pending") {
    await interaction.reply({ content: clanTxt.modAlreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canResolveCreateRequest(interaction.member as import("discord.js").GuildMember, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await assertModeratorQuotaInteraction(interaction))) return true;

  await interaction.deferUpdate();

  const result = await executeCreateRequest(interaction.guild, request);
  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return true;
  }

  request.status = "approved";
  request.createdRoleId = result.role.id;
  request.resolvedAt = Date.now();
  request.resolvedBy = interaction.user.id;
  setClanCreateRequest(request);
  await markModReviewMessageResolved(interaction.message, "approved", interaction.user.id);
  await deleteClanThreadMessage(
    interaction.guild,
    request.threadId,
    request.threadPendingMessageId,
  );
  await saveState(LAST_SEEN_STATE_FILE);

  await notifyClanRequestOutcome(
    interaction.guild,
    request.threadId,
    request.sourceMessageId,
    clanTxt.createSuccess(request.clanName),
    [request.applicantId],
  );

  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditCreate(interaction.member?.toString() ?? interaction.user.tag, request.clanName, request.memberIds.length),
  );

  if (!isModeratorQuotaExempt(interaction.member)) {
    recordModeratorQuotaUse(interaction.guild.id, interaction.user.id);
  }

  return true;
}

export async function handleClanModModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!interaction.customId.startsWith(`${CLAN_MOD_PREFIX}deny_modal:`)) return false;

  const requestId = interaction.customId.slice(`${CLAN_MOD_PREFIX}deny_modal:`.length);
  const request = getClanCreateRequest(requestId);
  if (!request || request.status !== "pending") {
    await interaction.reply({ content: clanTxt.modAlreadyResolved, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canResolveCreateRequest(interaction.member as import("discord.js").GuildMember, request)) {
    await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await assertModeratorQuotaInteraction(interaction))) return true;

  const reason = interaction.fields.getTextInputValue("reason").trim();
  request.status = "denied";
  request.denyReason = reason || undefined;
  request.resolvedAt = Date.now();
  request.resolvedBy = interaction.user.id;
  setClanCreateRequest(request);
  await saveState(LAST_SEEN_STATE_FILE);

  await deleteClanThreadMessage(
    interaction.guild,
    request.threadId,
    request.threadPendingMessageId,
  );

  await notifyClanRequestOutcome(
    interaction.guild,
    request.threadId,
    request.sourceMessageId,
    clanTxt.createDeniedApplicant(reason),
    [request.applicantId],
  );

  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditDenyCreate(interaction.member?.toString() ?? interaction.user.tag, request.clanName),
  );

  await interaction.reply({ content: clanTxt.modDenied, flags: MessageFlags.Ephemeral });

  if (request.reviewChannelId && request.reviewMessageId) {
    const ch = await interaction.guild.channels.fetch(request.reviewChannelId).catch(() => null);
    if (ch?.isTextBased()) {
      const msg = await ch.messages.fetch(request.reviewMessageId).catch(() => null);
      if (msg) {
        await markModReviewMessageResolved(msg, "denied", interaction.user.id, reason);
      }
    }
  }

  if (!isModeratorQuotaExempt(interaction.member)) {
    recordModeratorQuotaUse(interaction.guild.id, interaction.user.id);
  }

  return true;
}

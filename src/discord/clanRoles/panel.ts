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
  type Message,
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
import { newClanRequestId } from "./helpers";
import { canApproveGrantRequest } from "./permissions";
import { countClanLeaders, isClanLeaderFor, listClanLeaderIds } from "./resolver";
import { clanTxt } from "./strings";

export function isClanGrantCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_REQ_PREFIX);
}

function resolverRoleLabel(resolver: GuildMember, clanRoleId: string): "лидер клана" | "модератор" {
  if (isClanLeaderFor(resolver, clanRoleId)) return clanTxt.resolverRoleLeader;
  return clanTxt.resolverRoleMod;
}

export async function finalizeGrantRequestMessage(
  message: Message,
  approved: boolean,
  resolver: GuildMember,
  clanRoleId: string,
): Promise<void> {
  const existing = message.embeds[0];
  if (!existing) {
    await message.edit({ components: [] }).catch(() => undefined);
    return;
  }
  const roleLabel = resolverRoleLabel(resolver, clanRoleId);
  const baseDescription = existing.description ?? "";
  const statusLine = clanTxt.requestResolvedLine(approved, resolver.id, roleLabel);
  const embed = EmbedBuilder.from(existing)
    .setDescription(`${baseDescription}${statusLine}`)
    .setColor(approved ? 0x57f287 : 0x747f8d);
  await message.edit({
    embeds: [embed],
    components: [],
    allowedMentions: { users: [resolver.id] },
  }).catch(() => undefined);
}

export async function postPendingGrantRequest(
  guild: Guild,
  dest: GuildTextBasedChannel,
  request: ClanGrantRequest,
): Promise<void> {
  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);

  let pingContent: string | undefined;
  let leaderIdsToPing: string[] = [];
  if (request.type === "grant") {
    leaderIdsToPing = (await listClanLeaderIds(guild, request.clanRoleId)).filter(
      (id) => id !== request.requesterUserId,
    );
    if (leaderIdsToPing.length > 0) {
      pingContent = clanTxt.pendingGrantLeaderPing(leaderIdsToPing.map((id) => `<@${id}>`).join(" "));
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(clanTxt.pendingGrantTitle)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Участник:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}` +
        (request.grantLeaderMeta ? `\n\n${clanTxt.pendingGrantLeaderNote}` : ""),
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
): Promise<void> {
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
    createdAt: Date.now(),
  };
  setClanGrantRequest(request);
  await postPendingGrantRequest(guild, dest, request);
  await saveState(LAST_SEEN_STATE_FILE);
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
    await finalizeGrantRequestMessage(interaction.message, false, member, request.clanRoleId);
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
  await finalizeGrantRequestMessage(interaction.message, true, member, request.clanRoleId);
  await saveState(LAST_SEEN_STATE_FILE);

  await postClanAuditLine(
    interaction.guild,
    clanTxt.auditGrant(member.toString(), target.toString(), request.clanRoleName),
  );

  setTimeout(() => deleteClanGrantRequest(requestId), 60_000);
  return true;
}

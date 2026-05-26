import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type StringSelectMenuInteraction,
  type TextChannel,
  type UserSelectMenuInteraction,
} from "discord.js";
import { LAST_SEEN_STATE_FILE } from "../../config";
import {
  deleteClanGrantRequest,
  getClanGrantRequest,
  getClanRulesPanel,
  saveState,
  setClanGrantRequest,
} from "../../state";
import type { ClanGrantRequest, ClanRulesPanelState } from "../types";
import { grantClanRoleToMember, postClanAuditLine, removeClanRoleFromMember } from "./actions";
import { startCreateWizardFromPanel } from "./createWizard";
import {
  CLAN_PANEL_CREATE,
  CLAN_PANEL_GRANT,
  CLAN_PANEL_REMOVE,
  CLAN_REQ_PREFIX,
  CLAN_SELECT_PAGE_SIZE,
  CLAN_SELECT_PREFIX,
  MAX_CLAN_LEADERS,
} from "./constants";
import { newClanRequestId, resolveClanRequestsThread } from "./helpers";
import { canApproveGrantRequest, isClanModerator } from "./permissions";
import { countClanLeaders, isClanLeaderFor, listClanRoles } from "./resolver";
import { clanTxt } from "./strings";

type FlowType = "grant" | "remove";

type PanelFlowDraft = {
  type: FlowType;
  clanRoleId: string;
  clanRoleName: string;
  grantLeaderMeta: boolean;
  panel: ClanRulesPanelState;
};

const panelFlowDrafts = new Map<string, PanelFlowDraft>();
const panelSessionPanels = new Map<string, ClanRulesPanelState>();

function flowKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function isClanPanelCustomId(customId: string): boolean {
  return (
    customId === CLAN_PANEL_GRANT ||
    customId === CLAN_PANEL_REMOVE ||
    customId === CLAN_PANEL_CREATE ||
    customId.startsWith(CLAN_SELECT_PREFIX) ||
    customId.startsWith(CLAN_REQ_PREFIX)
  );
}

function clanSelectCustomId(flow: FlowType, page: number, userId: string): string {
  return `${CLAN_SELECT_PREFIX}${flow}:p${page}:${userId}`;
}

function clanNavCustomId(flow: FlowType, userId: string, page: number): string {
  return `${CLAN_SELECT_PREFIX}nav:${flow}:${userId}:${page}`;
}

function clanTargetCustomId(flow: FlowType, userId: string): string {
  return `${CLAN_SELECT_PREFIX}target:${flow}:${userId}`;
}

function buildClanSelectComponents(
  guild: Guild,
  flow: FlowType,
  userId: string,
  page: number,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const roles = listClanRoles(guild);
  const totalPages = Math.max(1, Math.ceil(roles.length / CLAN_SELECT_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = roles.slice(
    safePage * CLAN_SELECT_PAGE_SIZE,
    safePage * CLAN_SELECT_PAGE_SIZE + CLAN_SELECT_PAGE_SIZE,
  );

  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(clanSelectCustomId(flow, safePage, userId))
        .setPlaceholder(clanTxt.selectClanPlaceholder)
        .addOptions(
          slice.map((r) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(r.name.slice(0, 100))
              .setValue(r.id)
              .setDescription(`${r.members.size} участн.`),
          ),
        ),
    ),
  ];

  if (totalPages > 1) {
    const navOpts: StringSelectMenuOptionBuilder[] = [];
    if (safePage > 0) {
      navOpts.push(new StringSelectMenuOptionBuilder().setLabel("◀ Назад").setValue(String(safePage - 1)));
    }
    if (safePage < totalPages - 1) {
      navOpts.push(new StringSelectMenuOptionBuilder().setLabel("Вперёд ▶").setValue(String(safePage + 1)));
    }
    if (navOpts.length > 0) {
      rows.push(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(clanNavCustomId(flow, userId, safePage))
            .setPlaceholder(clanTxt.selectClanPage(safePage, totalPages))
            .addOptions(navOpts),
        ),
      );
    }
  }
  return rows;
}

async function postPendingGrantRequest(guild: Guild, panel: ClanRulesPanelState, request: ClanGrantRequest): Promise<void> {
  const target = await guild.members.fetch(request.targetUserId).catch(() => null);
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);
  const embed = new EmbedBuilder()
    .setTitle(request.type === "grant" ? clanTxt.pendingGrantTitle : clanTxt.pendingRemoveTitle)
    .setDescription(
      `**Клан:** ${request.clanRoleName}\n` +
        `**Участник:** ${target ?? `<@${request.targetUserId}>`}\n` +
        `**Запросил:** ${requester ?? `<@${request.requesterUserId}>`}` +
        (request.grantLeaderMeta ? `\n\n${clanTxt.pendingGrantLeaderNote}` : ""),
    )
    .setColor(request.type === "grant" ? 0x57f287 : 0xed4245)
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

  const dest = await resolveClanRequestsThread(guild, panel);
  if (!dest) return;
  const msg = await dest.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (msg) {
    request.pendingMessageId = msg.id;
    request.threadId = dest.isThread() ? dest.id : undefined;
    request.channelId = dest.id;
    setClanGrantRequest(request);
    await saveState(LAST_SEEN_STATE_FILE);
  }
}

async function submitGrantRequest(
  guild: Guild,
  draft: PanelFlowDraft,
  requesterId: string,
  targetUserId: string,
): Promise<void> {
  const request: ClanGrantRequest = {
    id: newClanRequestId(),
    guildId: guild.id,
    channelId: draft.panel.channelId,
    clanRoleId: draft.clanRoleId,
    clanRoleName: draft.clanRoleName,
    targetUserId,
    requesterUserId: requesterId,
    type: draft.type,
    grantLeaderMeta: draft.type === "grant" && draft.grantLeaderMeta,
    status: "pending",
    createdAt: Date.now(),
  };
  setClanGrantRequest(request);
  await postPendingGrantRequest(guild, draft.panel, request);
  panelFlowDrafts.delete(flowKey(guild.id, requesterId));
  await saveState(LAST_SEEN_STATE_FILE);
}

async function onClanRolePicked(
  interaction: StringSelectMenuInteraction,
  guild: Guild,
  flow: FlowType,
  userId: string,
  panel: ClanRulesPanelState,
  clanRoleId: string,
): Promise<void> {
  const role = guild.roles.cache.get(clanRoleId);
  if (!role) {
    await interaction.reply({ content: clanTxt.roleMissing, flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.member as GuildMember;
  panelFlowDrafts.set(flowKey(guild.id, userId), {
    type: flow,
    clanRoleId,
    clanRoleName: role.name,
    grantLeaderMeta: false,
    panel,
  });

  if (isClanModerator(member) || isClanLeaderFor(member, clanRoleId)) {
    await interaction.update({
      content: clanTxt.selectTargetPlaceholder,
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(clanTargetCustomId(flow, userId))
            .setPlaceholder(clanTxt.selectTargetPlaceholder)
            .setMinValues(1)
            .setMaxValues(1),
        ),
      ],
    });
    return;
  }

  await interaction.deferUpdate();
  const draft = panelFlowDrafts.get(flowKey(guild.id, userId));
  if (!draft) return;
  await submitGrantRequest(guild, draft, userId, userId);
  await interaction.editReply({ content: "Запрос отправлен. Ожидайте одобрения лидера клана или модератора.", components: [] });
}

export async function handleClanPanelButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const { customId } = interaction;
  if (!isClanPanelCustomId(customId)) return false;

  if (customId.startsWith(CLAN_REQ_PREFIX)) {
    return handleGrantRequestDecision(interaction);
  }

  const panel = getClanRulesPanel(interaction.message.id);
  if (!panel) {
    await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (customId === CLAN_PANEL_CREATE) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await startCreateWizardFromPanel(interaction.guild, interaction.member as GuildMember, panel);
    await interaction.editReply({ content: "Открыта приватная ветка для заявки. Перейдите в неё." });
    return true;
  }

  const flow: FlowType = customId === CLAN_PANEL_GRANT ? "grant" : "remove";
  panelSessionPanels.set(flowKey(interaction.guild.id, interaction.user.id), panel);
  const roles = listClanRoles(interaction.guild);
  if (roles.length === 0) {
    await interaction.reply({ content: clanTxt.selectClanEmpty, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.reply({
    content: clanTxt.selectClanPlaceholder,
    components: buildClanSelectComponents(interaction.guild, flow, interaction.user.id, 0),
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

export async function handleClanStringSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const { customId } = interaction;
  if (!customId.startsWith(CLAN_SELECT_PREFIX)) return false;

  const body = customId.slice(CLAN_SELECT_PREFIX.length);

  if (body.startsWith("nav:")) {
    const [, flow, userId, pageStr] = body.split(":");
    if (interaction.user.id !== userId || (flow !== "grant" && flow !== "remove")) {
      await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
      return true;
    }
    const page = parseInt(interaction.values[0] ?? pageStr ?? "0", 10);
    await interaction.update({
      content: clanTxt.selectClanPlaceholder,
      components: buildClanSelectComponents(interaction.guild, flow as FlowType, userId, page),
    });
    return true;
  }

  const navMatch = body.match(/^(grant|remove):p(\d+):(\d+)$/);
  if (!navMatch) return false;

  const flow = navMatch[1] as FlowType;
  const userId = navMatch[3];
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
    return true;
  }

  const panel =
    panelSessionPanels.get(flowKey(interaction.guild.id, userId)) ??
    getClanRulesPanel(interaction.message.id) ?? {
      messageId: "",
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
    };
  await onClanRolePicked(interaction, interaction.guild, flow, userId, panel, interaction.values[0]);
  return true;
}

export async function handleClanUserSelect(interaction: UserSelectMenuInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const body = interaction.customId.slice(CLAN_SELECT_PREFIX.length);
  const match = body.match(/^target:(grant|remove):(\d+)$/);
  if (!match) return false;

  const flow = match[1] as FlowType;
  const userId = match[2];
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
    return true;
  }

  const draft = panelFlowDrafts.get(flowKey(interaction.guild.id, userId));
  if (!draft) {
    await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();
  await submitGrantRequest(interaction.guild, draft, userId, interaction.values[0]);
  await interaction.editReply({ content: "Запрос отправлен. Ожидайте одобрения лидера клана или модератора.", components: [] });
  return true;
}

async function handleGrantRequestDecision(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const parts = interaction.customId.slice(CLAN_REQ_PREFIX.length).split(":");
  const action = parts[0];
  const requestId = parts[1];
  const request = getClanGrantRequest(requestId);
  if (!request || request.guildId !== interaction.guild.id) {
    await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
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
    await interaction.message.edit({ components: [] }).catch(() => undefined);
    await saveState(LAST_SEEN_STATE_FILE);
    return true;
  }

  const clanRole = await interaction.guild.roles.fetch(request.clanRoleId).catch(() => null);
  const target = await interaction.guild.members.fetch(request.targetUserId).catch(() => null);
  if (!clanRole || !target) {
    await interaction.followUp({ content: clanTxt.targetMissing, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (request.type === "grant" && request.grantLeaderMeta && countClanLeaders(interaction.guild, request.clanRoleId) >= MAX_CLAN_LEADERS) {
    await interaction.followUp({ content: clanTxt.grantLeaderCap(MAX_CLAN_LEADERS), flags: MessageFlags.Ephemeral });
    return true;
  }

  const result =
    request.type === "grant"
      ? await grantClanRoleToMember(interaction.guild, target, clanRole, request.grantLeaderMeta)
      : await removeClanRoleFromMember(interaction.guild, target, clanRole);

  if (!result.ok) {
    await interaction.followUp({ content: result.error, flags: MessageFlags.Ephemeral });
    return true;
  }

  request.status = "approved";
  setClanGrantRequest(request);
  await interaction.message.edit({ components: [] }).catch(() => undefined);
  await saveState(LAST_SEEN_STATE_FILE);

  await postClanAuditLine(
    interaction.guild,
    request.type === "grant"
      ? clanTxt.auditGrant(member.toString(), target.toString(), request.clanRoleName)
      : clanTxt.auditRemove(member.toString(), target.toString(), request.clanRoleName),
  );

  setTimeout(() => deleteClanGrantRequest(requestId), 60_000);
  return true;
}

export function buildClanPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CLAN_PANEL_GRANT).setLabel(clanTxt.panelGrant).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(CLAN_PANEL_REMOVE).setLabel(clanTxt.panelRemove).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(CLAN_PANEL_CREATE).setLabel(clanTxt.panelCreate).setStyle(ButtonStyle.Success),
    ),
  ];
}

export async function postClanPanelMessage(channel: TextChannel): Promise<string | null> {
  const msg = await channel.send({ content: clanTxt.panelIntro, components: buildClanPanelComponents() });
  return msg.id;
}

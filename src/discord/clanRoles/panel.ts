import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type ModalSubmitInteraction,
  type Role,
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
import {
  countClanLeaders,
  countMembersWithRole,
  ensureGuildMembersCached,
  isClanLeaderFor,
  listClanRoles,
  listMemberClanRoles,
  listMemberIdsWithRole,
  resolveClanRole,
} from "./resolver";
import { clanTxt } from "./strings";

type FlowType = "grant" | "remove";

type PanelFlowDraft = {
  type: FlowType;
  clanRoleId: string;
  clanRoleName: string;
  grantLeaderMeta: boolean;
  targetUserIds?: string[];
  panel: ClanRulesPanelState;
};

const panelFlowDrafts = new Map<string, PanelFlowDraft>();
const panelSessionPanels = new Map<string, ClanRulesPanelState>();
const panelRoleLists = new Map<string, string[]>();

function flowKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function roleListKey(guildId: string, userId: string, flow: FlowType): string {
  return `${guildId}:${userId}:${flow}`;
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
  return `${CLAN_SELECT_PREFIX}role:${flow}:${userId}:${page}`;
}

function clanNavCustomId(flow: FlowType, userId: string, page: number): string {
  return `${CLAN_SELECT_PREFIX}role_nav:${flow}:${userId}:${page}`;
}

function clanTargetCustomId(flow: FlowType, userId: string): string {
  return `${CLAN_SELECT_PREFIX}target:${flow}:${userId}`;
}

function clanTargetListCustomId(flow: FlowType, userId: string, clanRoleId: string, page: number): string {
  return `${CLAN_SELECT_PREFIX}target_list:${flow}:${userId}:${clanRoleId}:${page}`;
}

function clanTargetListNavCustomId(flow: FlowType, userId: string, clanRoleId: string, page: number): string {
  return `${CLAN_SELECT_PREFIX}target_nav:${flow}:${userId}:${clanRoleId}:${page}`;
}

function clanGrantSearchModalId(userId: string): string {
  return `${CLAN_SELECT_PREFIX}search:grant:${userId}`;
}

const CLAN_SEARCH_INPUT_ID = "query";

function setRoleList(guildId: string, userId: string, flow: FlowType, roleIds: string[]): void {
  panelRoleLists.set(roleListKey(guildId, userId, flow), roleIds);
}

function getRoleList(guildId: string, userId: string, flow: FlowType): string[] {
  return panelRoleLists.get(roleListKey(guildId, userId, flow)) ?? [];
}

function buildClanSelectComponents(
  guild: Guild,
  flow: FlowType,
  userId: string,
  page: number,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const roles = getRoleList(guild.id, userId, flow)
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role): role is Role => Boolean(role));
  if (roles.length === 0) return [];
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
              .setDescription(`${countMembersWithRole(guild, r.id)} участн.`),
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

function buildMemberTargetComponents(
  guild: Guild,
  flow: FlowType,
  userId: string,
  clanRoleId: string,
  memberIds: string[],
  page: number,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const totalPages = Math.max(1, Math.ceil(memberIds.length / CLAN_SELECT_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = memberIds.slice(
    safePage * CLAN_SELECT_PAGE_SIZE,
    safePage * CLAN_SELECT_PAGE_SIZE + CLAN_SELECT_PAGE_SIZE,
  );

  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(clanTargetListCustomId(flow, userId, clanRoleId, safePage))
        .setPlaceholder(clanTxt.selectTargetPlaceholder)
        .addOptions(
          slice.map((memberId) => {
            const member = guild.members.cache.get(memberId);
            return new StringSelectMenuOptionBuilder()
              .setLabel((member?.displayName ?? memberId).slice(0, 100))
              .setValue(memberId)
              .setDescription(member ? member.user.tag.slice(0, 100) : memberId);
          }),
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
            .setCustomId(clanTargetListNavCustomId(flow, userId, clanRoleId, safePage))
            .setPlaceholder(clanTxt.selectClanPage(safePage, totalPages))
            .addOptions(navOpts),
        ),
      );
    }
  }
  return rows;
}

function getRemoveRoleCandidates(guild: Guild, member: GuildMember): Role[] {
  const allClanRoles = listClanRoles(guild);
  const ownClanRoles = listMemberClanRoles(guild, member);
  if (isClanModerator(member)) {
    const ownIds = new Set(ownClanRoles.map((r) => r.id));
    return [...ownClanRoles, ...allClanRoles.filter((r) => !ownIds.has(r.id))];
  }
  const ledRoles = ownClanRoles.filter((r) => isClanLeaderFor(member, r.id));
  return ledRoles.length > 0 ? ledRoles : ownClanRoles;
}

async function finalizeGrantRequestMessage(
  message: Message,
  approved: boolean,
  resolver: GuildMember,
): Promise<void> {
  const existing = message.embeds[0];
  if (!existing) {
    await message.edit({ components: [] }).catch(() => undefined);
    return;
  }
  const embed = EmbedBuilder.from(existing)
    .setFooter({ text: clanTxt.requestResolvedFooter(approved, resolver.toString()) })
    .setColor(approved ? 0x57f287 : 0x747f8d);
  await message.edit({ embeds: [embed], components: [] }).catch(() => undefined);
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

async function performDirectRemove(
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

  if (flow === "remove") {
    const isModerator = isClanModerator(member);
    const leadsThisClan = isClanLeaderFor(member, clanRoleId);

    if (!isModerator && !member.roles.cache.has(clanRoleId)) {
      await interaction.reply({ content: clanTxt.removeNotYourClanRole, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!isModerator && !leadsThisClan) {
      await interaction.deferUpdate();
      const removed = await performDirectRemove(guild, member, role, userId);
      panelFlowDrafts.delete(flowKey(guild.id, userId));
      panelRoleLists.delete(roleListKey(guild.id, userId, "remove"));
      await interaction.editReply({
        content: removed.ok ? clanTxt.removeDone(role.name) : removed.error,
        components: [],
      });
      return;
    }
  }

  panelFlowDrafts.set(flowKey(guild.id, userId), {
    type: flow,
    clanRoleId,
    clanRoleName: role.name,
    grantLeaderMeta: false,
    panel,
  });

  if (flow === "remove" && (isClanModerator(member) || isClanLeaderFor(member, clanRoleId))) {
    await ensureGuildMembersCached(guild);
    const teammates = listMemberIdsWithRole(guild, clanRoleId);
    if (teammates.length === 0) {
      await interaction.update({ content: clanTxt.selectTargetNoMembers, components: [] });
      return;
    }
    teammates.sort((a, b) => {
      const am = guild.members.cache.get(a)?.displayName ?? a;
      const bm = guild.members.cache.get(b)?.displayName ?? b;
      return am.localeCompare(bm, "ru");
    });
    const draft = panelFlowDrafts.get(flowKey(guild.id, userId));
    if (draft) draft.targetUserIds = teammates;
    await interaction.update({
      content: clanTxt.selectTargetPlaceholder,
      components: buildMemberTargetComponents(guild, flow, userId, clanRoleId, teammates, 0),
    });
    return;
  }

  if (flow === "grant" && (isClanModerator(member) || isClanLeaderFor(member, clanRoleId))) {
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
  if (flow === "grant") {
    await submitGrantRequest(guild, draft, userId, userId);
    await interaction.editReply({ content: clanTxt.grantRequestSent, components: [] });
    return;
  }
  const removed = await performDirectRemove(guild, member, role, userId);
  panelFlowDrafts.delete(flowKey(guild.id, userId));
  panelRoleLists.delete(roleListKey(guild.id, userId, "remove"));
  await interaction.editReply({ content: removed.ok ? clanTxt.removeDone(role.name) : removed.error, components: [] });
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

  const member = interaction.member as GuildMember;

  if (customId === CLAN_PANEL_GRANT) {
    panelSessionPanels.set(flowKey(interaction.guild.id, interaction.user.id), panel);
    const modal = new ModalBuilder().setCustomId(clanGrantSearchModalId(interaction.user.id)).setTitle(clanTxt.grantSearchTitle);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(CLAN_SEARCH_INPUT_ID)
          .setLabel(clanTxt.grantSearchLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  const flow: FlowType = "remove";
  panelSessionPanels.set(flowKey(interaction.guild.id, interaction.user.id), panel);
  const candidates = getRemoveRoleCandidates(interaction.guild, member);
  if (candidates.length === 0) {
    await interaction.reply({ content: clanTxt.removeNoOwnClanRole, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (candidates.length === 1 && !isClanModerator(member) && !isClanLeaderFor(member, candidates[0].id)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = await performDirectRemove(interaction.guild, member, candidates[0], interaction.user.id);
    await interaction.editReply({ content: removed.ok ? clanTxt.removeDone(candidates[0].name) : removed.error });
    return true;
  }
  setRoleList(
    interaction.guild.id,
    interaction.user.id,
    flow,
    candidates.map((role) => role.id),
  );
  await ensureGuildMembersCached(interaction.guild);
  await interaction.reply({
    content: clanTxt.removeSelectClanPlaceholder,
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

  if (body.startsWith("role_nav:")) {
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

  if (body.startsWith("target_nav:")) {
    const [, flow, userId, clanRoleId, pageStr] = body.split(":");
    if (interaction.user.id !== userId || flow !== "remove") {
      await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
      return true;
    }
    const draft = panelFlowDrafts.get(flowKey(interaction.guild.id, userId));
    if (!draft || draft.clanRoleId !== clanRoleId || !draft.targetUserIds?.length) {
      await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
      return true;
    }
    const page = parseInt(interaction.values[0] ?? pageStr ?? "0", 10);
    await interaction.update({
      content: clanTxt.selectTargetPlaceholder,
      components: buildMemberTargetComponents(
        interaction.guild,
        "remove",
        userId,
        clanRoleId,
        draft.targetUserIds,
        page,
      ),
    });
    return true;
  }

  if (body.startsWith("target_list:")) {
    const [, flow, userId, clanRoleId] = body.split(":");
    if (interaction.user.id !== userId || flow !== "remove") {
      await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
      return true;
    }
    const draft = panelFlowDrafts.get(flowKey(interaction.guild.id, userId));
    if (!draft || draft.clanRoleId !== clanRoleId || !draft.targetUserIds?.length) {
      await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
      return true;
    }
    const targetUserId = interaction.values[0];
    if (!draft.targetUserIds.includes(targetUserId)) {
      await interaction.reply({ content: clanTxt.targetNotTeammate, flags: MessageFlags.Ephemeral });
      return true;
    }
    const role = interaction.guild.roles.cache.get(clanRoleId);
    if (!role) {
      await interaction.reply({ content: clanTxt.roleMissing, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    const removed = await performDirectRemove(interaction.guild, interaction.member as GuildMember, role, targetUserId);
    panelFlowDrafts.delete(flowKey(interaction.guild.id, userId));
    panelRoleLists.delete(roleListKey(interaction.guild.id, userId, "remove"));
    await interaction.editReply({ content: removed.ok ? clanTxt.removeDone(role.name) : removed.error, components: [] });
    return true;
  }

  const navMatch = body.match(/^role:(grant|remove):(\d+):(\d+)$/);
  if (!navMatch) return false;

  const flow = navMatch[1] as FlowType;
  const userId = navMatch[2];
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
  const match = body.match(/^target:(grant):(\d+)$/);
  if (!match) return false;

  const flow = match[1] as "grant";
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
  await interaction.editReply({ content: clanTxt.grantRequestSent, components: [] });
  return true;
}

export async function handleClanPanelModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const prefix = `${CLAN_SELECT_PREFIX}search:grant:`;
  if (!interaction.customId.startsWith(prefix)) return false;

  const userId = interaction.customId.slice(prefix.length);
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (!panelSessionPanels.has(flowKey(interaction.guild.id, userId))) {
    await interaction.reply({ content: clanTxt.panelUnknown, flags: MessageFlags.Ephemeral });
    return true;
  }

  const query = interaction.fields.getTextInputValue(CLAN_SEARCH_INPUT_ID).trim();
  const matches = resolveClanRole(interaction.guild, query);
  if (matches.length === 0) {
    await interaction.reply({ content: clanTxt.grantSearchNoResults(query), flags: MessageFlags.Ephemeral });
    return true;
  }

  setRoleList(
    interaction.guild.id,
    userId,
    "grant",
    matches.map((r) => r.id),
  );
  await ensureGuildMembersCached(interaction.guild);
  await interaction.reply({
    content: clanTxt.selectClanPlaceholder,
    components: buildClanSelectComponents(interaction.guild, "grant", userId, 0),
    flags: MessageFlags.Ephemeral,
  });
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
    await finalizeGrantRequestMessage(interaction.message, false, member);
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
  await finalizeGrantRequestMessage(interaction.message, true, member);
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

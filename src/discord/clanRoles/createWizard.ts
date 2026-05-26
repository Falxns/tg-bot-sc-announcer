import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Message,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type StringSelectMenuInteraction,
  type AnyThreadChannel,
} from "discord.js";
import {
  DISCORD_CLAN_ROSTER_MAX,
  DISCORD_CLAN_ROSTER_MIN,
  LAST_SEEN_STATE_FILE,
} from "../../config";
import {
  deleteClanCreateWizard,
  getClanCreateWizard,
  saveState,
  setClanCreateWizard,
} from "../../state";
import type { ClanCreateWizardState, ClanRulesPanelState } from "../types";
import { getClanColorPresetById, getClanColorPresets } from "./colorPresets";
import {
  CLAN_NAME_MAX_LEN,
  CLAN_NAME_MIN_LEN,
  CLAN_WIZ_PREFIX,
  MAX_CLAN_LEADERS,
} from "./constants";
import { formatUserList, parseLeaderIdsFromMentions, validateClanName } from "./helpers";
import { submitCreateRequestToModQueue } from "./modQueue";
import { clanTxt } from "./strings";

function wizColorSelectId(threadId: string): string {
  return `${CLAN_WIZ_PREFIX}color:${threadId}`;
}

function wizConfirmId(threadId: string): string {
  return `${CLAN_WIZ_PREFIX}confirm:${threadId}`;
}

function wizEditId(threadId: string): string {
  return `${CLAN_WIZ_PREFIX}edit:${threadId}`;
}

export function isClanWizardCustomId(customId: string): boolean {
  return customId.startsWith(CLAN_WIZ_PREFIX);
}

export async function startCreateWizardFromPanel(
  guild: Guild,
  applicant: GuildMember,
  panel: ClanRulesPanelState,
): Promise<void> {
  const parent = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildText) return;

  const thread = await parent.threads.create({
    name: `clan-${applicant.user.username}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: "Clan create wizard",
  });
  await thread.members.add(applicant.id).catch(() => undefined);

  const now = Date.now();
  const wizard: ClanCreateWizardState = {
    threadId: thread.id,
    guildId: guild.id,
    channelId: parent.id,
    applicantId: applicant.id,
    step: "name",
    createdAt: now,
    updatedAt: now,
  };
  setClanCreateWizard(wizard);
  await saveState(LAST_SEEN_STATE_FILE);

  await thread.send(clanTxt.wizardWelcome(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX));
  await thread.send(clanTxt.wizardAskName);
}

async function promptColorStep(thread: AnyThreadChannel, wizard: ClanCreateWizardState): Promise<void> {
  wizard.step = "color";
  wizard.updatedAt = Date.now();
  setClanCreateWizard(wizard);
  await saveState(LAST_SEEN_STATE_FILE);

  const presets = getClanColorPresets();
  const select = new StringSelectMenuBuilder()
    .setCustomId(wizColorSelectId(wizard.threadId))
    .setPlaceholder(clanTxt.wizardColorPlaceholder)
    .addOptions(
      presets.map((p) =>
        new StringSelectMenuOptionBuilder().setLabel(p.label).setValue(p.id).setDescription(`#${p.hex.toString(16).padStart(6, "0")}`),
      ),
    );

  await thread.send({
    content: clanTxt.wizardAskColor,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function promptRosterStep(thread: AnyThreadChannel, wizard: ClanCreateWizardState): Promise<void> {
  wizard.step = "roster";
  wizard.updatedAt = Date.now();
  setClanCreateWizard(wizard);
  await saveState(LAST_SEEN_STATE_FILE);
  await thread.send(clanTxt.wizardAskRoster(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX));
}

async function showReviewStep(guild: Guild, thread: AnyThreadChannel, wizard: ClanCreateWizardState): Promise<void> {
  wizard.step = "review";
  wizard.updatedAt = Date.now();
  setClanCreateWizard(wizard);
  await saveState(LAST_SEEN_STATE_FILE);

  const leaderSet = new Set(wizard.leaderIds ?? []);
  const embed = new EmbedBuilder()
    .setTitle(clanTxt.wizardReviewTitle)
    .setColor(wizard.colorHex ?? 0x5865f2)
    .addFields(
      { name: "Название", value: wizard.clanName ?? "—", inline: true },
      { name: "Цвет", value: wizard.colorLabel ?? "—", inline: true },
      {
        name: `Состав (${wizard.memberIds?.length ?? 0})`,
        value: formatUserList(guild, wizard.memberIds ?? [], leaderSet).slice(0, 1024),
      },
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(wizConfirmId(wizard.threadId)).setLabel(clanTxt.wizardConfirm).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(wizEditId(wizard.threadId)).setLabel(clanTxt.wizardEdit).setStyle(ButtonStyle.Secondary),
  );

  await thread.send({ embeds: [embed], components: [row] });
}

export async function handleClanWizardMessage(message: Message): Promise<boolean> {
  if (!message.inGuild() || !message.guild || message.author.bot) return false;
  if (!message.channel.isThread()) return false;

  const wizard = getClanCreateWizard(message.channel.id);
  if (!wizard || wizard.guildId !== message.guild.id) return false;
  if (message.author.id !== wizard.applicantId) {
    await message.reply(clanTxt.wizardWrongUser).catch(() => undefined);
    return true;
  }

  const thread = message.channel;

  if (wizard.step === "name") {
    const name = message.content.trim();
    const invalid = validateClanName(name, CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN);
    if (invalid === "length") {
      await message.reply(clanTxt.wizardNameInvalid(CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN));
      return true;
    }
    if (invalid === "chars") {
      await message.reply(clanTxt.wizardNameInvalid(CLAN_NAME_MIN_LEN, CLAN_NAME_MAX_LEN));
      return true;
    }
    const dup = message.guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      await message.reply(clanTxt.wizardNameDuplicate);
      return true;
    }
    wizard.clanName = name;
    await promptColorStep(thread, wizard);
    return true;
  }

  if (wizard.step === "roster") {
    const memberIds = [...message.mentions.users.keys()];
    const unique = [...new Set(memberIds)];
    if (unique.length < DISCORD_CLAN_ROSTER_MIN || unique.length > DISCORD_CLAN_ROSTER_MAX) {
      await message.reply(clanTxt.wizardRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX));
      return true;
    }

    const onServer: string[] = [];
    for (const id of unique) {
      const m = await message.guild.members.fetch(id).catch(() => null);
      if (m) onServer.push(id);
    }
    if (onServer.length !== unique.length) {
      await message.reply(clanTxt.wizardRosterInvalid(DISCORD_CLAN_ROSTER_MIN, DISCORD_CLAN_ROSTER_MAX));
      return true;
    }

    let leaders = parseLeaderIdsFromMentions(message.content, onServer);
    if (leaders.length === 0 && onServer.length >= 1) {
      leaders = [onServer[0]];
    }
    if (leaders.length < 1 || leaders.length > MAX_CLAN_LEADERS) {
      await message.reply(clanTxt.wizardLeadersInvalid);
      return true;
    }
    if (!leaders.every((id) => onServer.includes(id))) {
      await message.reply(clanTxt.wizardLeadersInvalid);
      return true;
    }

    wizard.memberIds = onServer;
    wizard.leaderIds = leaders;
    await showReviewStep(message.guild, thread, wizard);
    return true;
  }

  return false;
}

export async function handleClanWizardStringSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (!interaction.customId.startsWith(`${CLAN_WIZ_PREFIX}color:`)) return false;

  const threadId = interaction.customId.slice(`${CLAN_WIZ_PREFIX}color:`.length);
  const wizard = getClanCreateWizard(threadId);
  if (!wizard || wizard.applicantId !== interaction.user.id) {
    await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
    return true;
  }

  const preset = getClanColorPresetById(interaction.values[0]);
  if (!preset) {
    await interaction.reply({ content: clanTxt.internalError, flags: MessageFlags.Ephemeral });
    return true;
  }

  wizard.colorPresetId = preset.id;
  wizard.colorHex = preset.hex;
  wizard.colorLabel = preset.label;
  wizard.updatedAt = Date.now();
  setClanCreateWizard(wizard);
  await saveState(LAST_SEEN_STATE_FILE);

  await interaction.update({ content: `Цвет: **${preset.label}**`, components: [] });

  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
  if (thread?.isThread()) {
    await promptRosterStep(thread, wizard);
  }
  return true;
}

export async function handleClanWizardButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const { customId } = interaction;
  if (!customId.startsWith(CLAN_WIZ_PREFIX)) return false;

  const confirmPrefix = `${CLAN_WIZ_PREFIX}confirm:`;
  const editPrefix = `${CLAN_WIZ_PREFIX}edit:`;

  let threadId = "";
  let action: "confirm" | "edit" | null = null;
  if (customId.startsWith(confirmPrefix)) {
    threadId = customId.slice(confirmPrefix.length);
    action = "confirm";
  } else if (customId.startsWith(editPrefix)) {
    threadId = customId.slice(editPrefix.length);
    action = "edit";
  } else {
    return false;
  }

  const wizard = getClanCreateWizard(threadId);
  if (!wizard || wizard.applicantId !== interaction.user.id) {
    await interaction.reply({ content: clanTxt.wizardWrongUser, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "edit") {
    wizard.step = "name";
    wizard.clanName = undefined;
    wizard.colorPresetId = undefined;
    wizard.colorHex = undefined;
    wizard.colorLabel = undefined;
    wizard.memberIds = undefined;
    wizard.leaderIds = undefined;
    wizard.updatedAt = Date.now();
    setClanCreateWizard(wizard);
    await saveState(LAST_SEEN_STATE_FILE);
    await interaction.update({ components: [] });
    const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
    if (thread?.isTextBased()) {
      await thread.send(clanTxt.wizardAskName);
    }
    return true;
  }

  await interaction.deferUpdate();
  await interaction.message.edit({ components: [] }).catch(() => undefined);

  const err = await submitCreateRequestToModQueue(interaction.guild, wizard);
  if (err) {
    await interaction.followUp({ content: err, flags: MessageFlags.Ephemeral });
    return true;
  }

  deleteClanCreateWizard(threadId);
  await saveState(LAST_SEEN_STATE_FILE);

  const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
  if (thread?.isTextBased()) {
    await thread.send(clanTxt.wizardSubmitted);
  }
  return true;
}

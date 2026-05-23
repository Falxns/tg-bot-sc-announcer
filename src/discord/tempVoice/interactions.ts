import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from "discord.js";
import { DISCORD_VOICE_INVITE_MAX_AGE_SEC, LAST_SEEN_STATE_FILE } from "../../config";
import { findTempVoiceRoomByOwner, saveState, setTempVoicePanel, setTempVoiceRoom } from "../../state";
import { canControlTempVoiceRoom } from "./permissions";
import { deleteTempVoiceRoomFull } from "./lifecycle";
import { formatTempVoiceActionError } from "./errors";
import { resolveOwnerVoiceChannel, setRoomLocked, transferTempVoiceOwnership } from "./hub";
import { TEMP_VOICE_REGIONS, tempVoiceStrings as tv, VOICE_BUTTON_EMOJIS, VOICE_BUTTON_PREFIX } from "./strings";

function isVoiceControlId(customId: string): boolean {
  return customId.startsWith(VOICE_BUTTON_PREFIX);
}

export function isTempVoiceInteractionCustomId(customId: string): boolean {
  return isVoiceControlId(customId);
}

async function requireOwnerRoom(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | UserSelectMenuInteraction
    | StringSelectMenuInteraction,
) {
  if (!interaction.inGuild() || !interaction.guild) return null;
  const member = interaction.member;
  if (!member || typeof member === "string") return null;
  const resolved = await resolveOwnerVoiceChannel(interaction.guild, interaction.user.id);
  if (!resolved) {
    await interaction.reply({ content: tv.noActiveRoom, flags: MessageFlags.Ephemeral });
    return null;
  }
  if (!canControlTempVoiceRoom(member, resolved.room)) {
    await interaction.reply({ content: tv.notOwner, flags: MessageFlags.Ephemeral });
    return null;
  }
  return resolved;
}

function voicePanelButton(id: string, emoji: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${VOICE_BUTTON_PREFIX}${id}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(emoji);
}

export async function handleTempVoiceButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !isVoiceControlId(interaction.customId)) return false;

  const action = interaction.customId.slice(VOICE_BUTTON_PREFIX.length);

  if (action === "delete_confirm") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await deleteTempVoiceRoomFull(interaction.guild!, resolved.room.voiceChannelId);
      await interaction.editReply({ content: tv.deleteDone });
    } catch (err) {
      await interaction.editReply({ content: formatTempVoiceActionError(err, "delete") });
    }
    return true;
  }

  if (action === "delete") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      voicePanelButton("delete_confirm", VOICE_BUTTON_EMOJIS.deleteConfirm),
    );
    await interaction.reply({ content: tv.deletePrompt, components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "name") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const modal = new ModalBuilder().setCustomId(`${VOICE_BUTTON_PREFIX}name_modal`).setTitle(tv.nameModalTitle);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel(tv.nameModalLabel)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue(resolved.channel.name.slice(0, 100)),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (action === "limit") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const modal = new ModalBuilder().setCustomId(`${VOICE_BUTTON_PREFIX}limit_modal`).setTitle(tv.limitModalTitle);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limit")
          .setLabel(tv.limitModalLabel)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(resolved.channel.userLimit ?? 0)),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (action === "access") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const next = !resolved.room.locked;
      await setRoomLocked(resolved.channel, resolved.room, next);
      await interaction.editReply({ content: next ? tv.accessLocked : tv.accessUnlocked });
    } catch (err) {
      await interaction.editReply({ content: formatTempVoiceActionError(err, "access toggle") });
    }
    return true;
  }

  if (action === "transfer") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`${VOICE_BUTTON_PREFIX}transfer_select`)
        .setPlaceholder(tv.transferPrompt)
        .setMinValues(1)
        .setMaxValues(1),
    );
    await interaction.reply({ content: tv.transferPrompt, components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "invite") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const invite = await resolved.channel.createInvite({
        maxAge: DISCORD_VOICE_INVITE_MAX_AGE_SEC,
        maxUses: 0,
        unique: true,
      });
      await interaction.editReply({ content: tv.inviteLink(invite.url) });
    } catch (err) {
      await interaction.editReply({ content: formatTempVoiceActionError(err, "invite") });
    }
    return true;
  }

  if (action === "kick") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`${VOICE_BUTTON_PREFIX}kick_select`)
        .setPlaceholder(tv.kickPrompt)
        .setMinValues(1)
        .setMaxValues(1),
    );
    await interaction.reply({ content: tv.kickPrompt, components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "region") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${VOICE_BUTTON_PREFIX}region_select`)
      .setPlaceholder(tv.regionPrompt)
      .addOptions(
        TEMP_VOICE_REGIONS.map((r) =>
          new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.value).setDefault(
            (resolved.room.rtcRegion ?? "auto") === r.value ||
              (r.value === "auto" && !resolved.room.rtcRegion && !resolved.channel.rtcRegion),
          ),
        ),
      );
    await interaction.reply({
      content: tv.regionPrompt,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}

export async function handleTempVoiceModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (!id.startsWith(VOICE_BUTTON_PREFIX)) return false;

  if (id === `${VOICE_BUTTON_PREFIX}name_modal`) {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const name = interaction.fields.getTextInputValue("name").trim();
    if (!name) {
      await interaction.reply({ content: tv.invalidName, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await resolved.channel.setName(name.slice(0, 100));
      await interaction.editReply({ content: tv.nameUpdated(name) });
    } catch (err) {
      await interaction.editReply({ content: formatTempVoiceActionError(err, "rename") });
    }
    return true;
  }

  if (id === `${VOICE_BUTTON_PREFIX}limit_modal`) {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const raw = interaction.fields.getTextInputValue("limit").trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      await interaction.reply({ content: tv.invalidLimit, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await resolved.channel.setUserLimit(n);
      resolved.room.userLimit = n;
      setTempVoiceRoom(resolved.room);
      await saveState(LAST_SEEN_STATE_FILE);
      await interaction.editReply({ content: tv.limitUpdated(n) });
    } catch (err) {
      await interaction.editReply({ content: formatTempVoiceActionError(err, "limit") });
    }
    return true;
  }

  return false;
}

export async function handleTempVoiceUserSelect(interaction: UserSelectMenuInteraction): Promise<boolean> {
  const customId = interaction.customId;

  if (customId === `${VOICE_BUTTON_PREFIX}kick_select`) {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const targetId = interaction.values[0];
    if (!targetId) return true;
    await interaction.deferUpdate();
    try {
      const member = await interaction.guild!.members.fetch(targetId);
      if (!member.voice.channelId || member.voice.channelId !== resolved.channel.id) {
        await interaction.followUp({ content: tv.kickNotInChannel, flags: MessageFlags.Ephemeral });
        return true;
      }
      await member.voice.disconnect();
      await interaction.followUp({ content: tv.kickDone(targetId), flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.followUp({
        content: formatTempVoiceActionError(err, "kick"),
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  if (customId === `${VOICE_BUTTON_PREFIX}transfer_select`) {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const targetId = interaction.values[0];
    if (!targetId) return true;
    if (targetId === interaction.user.id) {
      await interaction.reply({ content: tv.transferSelf, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferUpdate();
    try {
      const member = await interaction.guild!.members.fetch(targetId);
      if (member.user.bot) {
        await interaction.followUp({ content: tv.actionFailed, flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!member.voice.channelId || member.voice.channelId !== resolved.channel.id) {
        await interaction.followUp({ content: tv.transferNotInChannel, flags: MessageFlags.Ephemeral });
        return true;
      }
      const existing = findTempVoiceRoomByOwner(interaction.guild!.id, targetId);
      if (existing && existing.voiceChannelId !== resolved.channel.id) {
        await interaction.followUp({ content: tv.transferAlreadyOwns, flags: MessageFlags.Ephemeral });
        return true;
      }
      await transferTempVoiceOwnership(resolved.channel, resolved.room, targetId);
      await interaction.followUp({ content: tv.transferDone(targetId), flags: MessageFlags.Ephemeral });
    } catch (err) {
      await interaction.followUp({
        content: formatTempVoiceActionError(err, "transfer"),
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  return false;
}

export async function handleTempVoiceStringSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== `${VOICE_BUTTON_PREFIX}region_select`) return false;
  const resolved = await requireOwnerRoom(interaction);
  if (!resolved) return true;
  const value = interaction.values[0];
  const label = TEMP_VOICE_REGIONS.find((r) => r.value === value)?.label ?? value;
  await interaction.deferUpdate();
  try {
    const region = value === "auto" ? null : value;
    await resolved.channel.setRTCRegion(region);
    resolved.room.rtcRegion = region;
    setTempVoiceRoom(resolved.room);
    await saveState(LAST_SEEN_STATE_FILE);
    await interaction.followUp({ content: tv.regionUpdated(label), flags: MessageFlags.Ephemeral });
  } catch (err) {
    await interaction.followUp({
      content: formatTempVoiceActionError(err, "region"),
      flags: MessageFlags.Ephemeral,
    });
  }
  return true;
}

export function buildTempVoicePanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    voicePanelButton("name", VOICE_BUTTON_EMOJIS.name),
    voicePanelButton("limit", VOICE_BUTTON_EMOJIS.limit),
    voicePanelButton("access", VOICE_BUTTON_EMOJIS.access),
    voicePanelButton("region", VOICE_BUTTON_EMOJIS.region),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    voicePanelButton("invite", VOICE_BUTTON_EMOJIS.invite),
    voicePanelButton("kick", VOICE_BUTTON_EMOJIS.kick),
    voicePanelButton("transfer", VOICE_BUTTON_EMOJIS.transfer),
    voicePanelButton("delete", VOICE_BUTTON_EMOJIS.delete),
  );
  return [row1, row2];
}

export async function postTempVoicePanel(guild: Guild, channelId: string): Promise<string> {
  const ch = await guild.channels.fetch(channelId);
  if (!ch?.isTextBased() || !("send" in ch)) {
    throw new Error("Panel channel not text-based");
  }
  const embed = new EmbedBuilder()
    .setTitle(tv.panelTitle)
    .setDescription(tv.panelDescription)
    .setFooter({ text: tv.panelFooter });
  const sent = await ch.send({ embeds: [embed], components: buildTempVoicePanelComponents() });
  setTempVoicePanel({ guildId: guild.id, channelId, messageId: sent.id });
  await saveState(LAST_SEEN_STATE_FILE);
  return sent.id;
}

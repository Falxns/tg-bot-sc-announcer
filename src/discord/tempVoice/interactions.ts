import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
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
import {
  DISCORD_VOICE_INVITE_MAX_AGE_SEC,
  DISCORD_VOICE_TEMP_CATEGORY_ID,
  LAST_SEEN_STATE_FILE,
} from "../../config";
import { deleteTempVoiceRoom, saveState, setTempVoicePanel, setTempVoiceRoom } from "../../state";
import { canControlTempVoiceRoom } from "./permissions";
import { deleteTempVoiceRoomFull } from "./lifecycle";
import { resolveOwnerVoiceChannel, setRoomLocked } from "./hub";
import { TEMP_VOICE_REGIONS, tempVoiceStrings as tv, VOICE_BUTTON_PREFIX } from "./strings";

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

export async function handleTempVoiceButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !isVoiceControlId(interaction.customId)) return false;

  const action = interaction.customId.slice(VOICE_BUTTON_PREFIX.length);

  if (action === "delete_confirm") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await deleteTempVoiceRoomFull(interaction.guild!, resolved.room.voiceChannelId);
    await interaction.editReply({ content: tv.deleteDone });
    return true;
  }

  if (action === "delete") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${VOICE_BUTTON_PREFIX}delete_confirm`)
        .setLabel(tv.btnDeleteConfirm)
        .setStyle(ButtonStyle.Danger),
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
    } catch {
      await interaction.editReply({ content: tv.actionFailed });
    }
    return true;
  }

  if (action === "chat") {
    const resolved = await requireOwnerRoom(interaction);
    if (!resolved) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const guild = interaction.guild!;
      if (resolved.room.textChannelId) {
        const textCh = await guild.channels.fetch(resolved.room.textChannelId).catch(() => null);
        if (textCh) await textCh.delete().catch(() => undefined);
        resolved.room.textChannelId = undefined;
        setTempVoiceRoom(resolved.room);
        await saveState(LAST_SEEN_STATE_FILE);
        await interaction.editReply({ content: tv.chatRemoved });
      } else {
        const text = await guild.channels.create({
          name: `чат-${resolved.channel.name}`.slice(0, 100),
          type: ChannelType.GuildText,
          parent: DISCORD_VOICE_TEMP_CATEGORY_ID,
          permissionOverwrites: resolved.channel.permissionOverwrites.cache.map((o) => ({
            id: o.id,
            allow: o.allow,
            deny: o.deny,
            type: o.type,
          })),
        });
        resolved.room.textChannelId = text.id;
        setTempVoiceRoom(resolved.room);
        await saveState(LAST_SEEN_STATE_FILE);
        await interaction.editReply({ content: tv.chatCreated(text.id) });
      }
    } catch {
      await interaction.editReply({ content: tv.actionFailed });
    }
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
    } catch {
      await interaction.editReply({ content: tv.actionFailed });
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
    } catch {
      await interaction.editReply({ content: tv.actionFailed });
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
    } catch {
      await interaction.editReply({ content: tv.actionFailed });
    }
    return true;
  }

  return false;
}

export async function handleTempVoiceUserSelect(interaction: UserSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== `${VOICE_BUTTON_PREFIX}kick_select`) return false;
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
  } catch {
    await interaction.followUp({ content: tv.actionFailed, flags: MessageFlags.Ephemeral });
  }
  return true;
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
  } catch {
    await interaction.followUp({ content: tv.actionFailed, flags: MessageFlags.Ephemeral });
  }
  return true;
}

export function buildTempVoicePanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const defs: { id: string; label: string; style: ButtonStyle }[] = [
    { id: "name", label: tv.btnName, style: ButtonStyle.Primary },
    { id: "limit", label: tv.btnLimit, style: ButtonStyle.Primary },
    { id: "access", label: tv.btnAccess, style: ButtonStyle.Primary },
    { id: "chat", label: tv.btnChat, style: ButtonStyle.Primary },
    { id: "invite", label: tv.btnInvite, style: ButtonStyle.Secondary },
    { id: "kick", label: tv.btnKick, style: ButtonStyle.Secondary },
    { id: "delete", label: tv.btnDelete, style: ButtonStyle.Danger },
    { id: "region", label: tv.btnRegion, style: ButtonStyle.Secondary },
  ];
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!;
    const btn = new ButtonBuilder()
      .setCustomId(`${VOICE_BUTTON_PREFIX}${d.id}`)
      .setLabel(d.label)
      .setStyle(d.style);
    if (i < 4) row1.addComponents(btn);
    else row2.addComponents(btn);
  }
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

import { PermissionFlagsBits, SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { DISCORD_VOICE_PANEL_CHANNEL_ID, tempVoiceConfigured } from "../../config";
import { postTempVoicePanel } from "./interactions";
import { tempVoiceStrings as tv } from "./strings";

export const voicePanelSlashCommand = new SlashCommandBuilder()
  .setName("voicepanel")
  .setDescription("Опубликовать панель управления временными голосовыми каналами")
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription(tv.voicepanelChannel)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function handleVoicePanelCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!tempVoiceConfigured()) {
    await interaction.reply({ content: tv.voiceNotConfigured, flags: MessageFlags.Ephemeral });
    return;
  }
  const channelRef = interaction.options.getChannel("channel");
  const channelId = channelRef?.id ?? DISCORD_VOICE_PANEL_CHANNEL_ID;
  if (!channelId) {
    await interaction.reply({
      content: "Укажите channel или задайте DISCORD_VOICE_PANEL_CHANNEL_ID.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await postTempVoicePanel(interaction.guild!, channelId);
    await interaction.editReply({ content: tv.voicepanelPosted(channelId) });
  } catch (err) {
    console.error("/voicepanel failed:", err);
    await interaction.editReply({ content: tv.actionFailed });
  }
}

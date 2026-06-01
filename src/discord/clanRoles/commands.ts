import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import {
  DISCORD_CLAN_RULES_MESSAGE_ID,
  LAST_SEEN_STATE_FILE,
  clanRolesConfigured,
} from "../../config";
import { isClanModerator } from "./permissions";
import { saveState, setClanRulesPanel } from "../../state";
import { formatClansListEmbedLines } from "./actions";
import { buildClanRulesHelpEmbed, clanTxt } from "./strings";

export const clanPanelSlashCommand = new SlashCommandBuilder()
  .setName("clanpanel")
  .setDescription("Опубликовать справку по клановым командам в канале правил")
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Канал для справки (по умолчанию — текущий)")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const clanslistSlashCommand = new SlashCommandBuilder()
  .setName("clanslist")
  .setDescription("Список клановых ролей и число лидеров (для админов)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function handleClanSlashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const name = interaction.commandName;
  if (name !== "clanpanel" && name !== "clanslist") return false;

  if (!clanRolesConfigured()) {
    await interaction.reply({ content: clanTxt.notConfigured, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (name === "clanslist") {
    if (!isClanModerator(interaction.member as import("discord.js").GuildMember)) {
      await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
      return true;
    }
    const lines = await formatClansListEmbedLines(interaction.guild);
    const embed = new EmbedBuilder()
      .setTitle(clanTxt.clanslistTitle)
      .setDescription(lines.join("\n").slice(0, 4096))
      .setColor(0x5865f2);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return true;
  }

  const channelOpt = interaction.options.getChannel("channel");
  const channel =
    channelOpt && (channelOpt.type === ChannelType.GuildText || channelOpt.type === ChannelType.GuildAnnouncement)
      ? (channelOpt as TextChannel)
      : interaction.channel?.isTextBased()
        ? (interaction.channel as TextChannel)
        : null;

  if (!channel) {
    await interaction.reply({ content: "Укажите текстовый канал.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const msg = await channel.send({ embeds: [buildClanRulesHelpEmbed()] });
  setClanRulesPanel({
    messageId: msg.id,
    guildId: interaction.guild.id,
    channelId: channel.id,
    rulesParentMessageId: DISCORD_CLAN_RULES_MESSAGE_ID || undefined,
  });
  await saveState(LAST_SEEN_STATE_FILE);
  await interaction.reply({ content: clanTxt.rulesHelpPosted(msg.url), flags: MessageFlags.Ephemeral });
  return true;
}

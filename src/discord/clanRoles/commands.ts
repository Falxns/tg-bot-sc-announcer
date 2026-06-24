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
import {
  findClanRolesWithExcessLeaders,
  findClanRolesWithExcessRecruiters,
  findLeaderRecruiterOverlap,
  findLeadersWithoutClanRole,
  findMembersWithMultipleClanRoles,
  findRecruitersWithoutClanRole,
} from "./auditChecks";
import { formatClansListEmbedLines } from "./actions";
import { canApproveCreateRequest, isClanModerator } from "./permissions";
import { saveState, setClanRulesPanel } from "../../state";
import { listMemberClanRoles } from "./resolver";
import { buildClanRulesHelpContent, buildClanRulesHelpEmbeds, clanTxt } from "./strings";

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
  .setDescription("Список клановых ролей, лидеров и рекрутеров (для админов)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const clancheckSlashCommand = new SlashCommandBuilder()
  .setName("clancheck")
  .setDescription("Проверка клановых ролей и лидеров на нарушения")
  .addStringOption((opt) =>
    opt
      .setName("check")
      .setDescription("Тип проверки")
      .setRequired(true)
      .addChoices(
        { name: "Лидеры без клановой роли", value: "leaders_without_clan" },
        { name: "Рекрутеры без клановой роли", value: "recruiters_without_clan" },
        { name: "2+ клановые роли у участника", value: "multi_clan_members" },
        { name: "Более 1 лидера у клана", value: "multi_leaders" },
        { name: "Более 2 рекрутеров у клана", value: "multi_recruiters" },
        { name: "Лидер и рекрутер в одном клане", value: "leader_recruiter_overlap" },
      ),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function handleClanSlashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guild) return false;
  const name = interaction.commandName;
  if (name !== "clanpanel" && name !== "clanslist" && name !== "clancheck") return false;

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

  if (name === "clancheck") {
    if (!canApproveCreateRequest(interaction.member as import("discord.js").GuildMember)) {
      await interaction.reply({ content: clanTxt.cannotApprove, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const check = interaction.options.getString("check", true);
    let title = "";
    let lines: string[] = [];

    if (check === "leaders_without_clan") {
      title = clanTxt.clancheckLeadersWithoutClanTitle;
      const members = await findLeadersWithoutClanRole(interaction.guild);
      lines = members.length > 0 ? members.map((m) => m.toString()) : [clanTxt.clancheckEmpty];
    } else if (check === "recruiters_without_clan") {
      title = clanTxt.clancheckRecruitersWithoutClanTitle;
      const members = await findRecruitersWithoutClanRole(interaction.guild);
      lines = members.length > 0 ? members.map((m) => m.toString()) : [clanTxt.clancheckEmpty];
    } else if (check === "multi_clan_members") {
      title = clanTxt.clancheckMultiClanTitle;
      const members = await findMembersWithMultipleClanRoles(interaction.guild);
      lines =
        members.length > 0
          ? members.map((m) =>
              clanTxt.clancheckMultiClanLine(
                m.toString(),
                listMemberClanRoles(interaction.guild!, m).map((r) => r.name),
              ),
            )
          : [clanTxt.clancheckEmpty];
    } else if (check === "multi_leaders") {
      title = clanTxt.clancheckMultiLeadersTitle;
      const roles = await findClanRolesWithExcessLeaders(interaction.guild);
      lines =
        roles.length > 0
          ? roles.map(({ role, count }) => clanTxt.clancheckMultiLeadersLine(role.name, count))
          : [clanTxt.clancheckEmpty];
    } else if (check === "multi_recruiters") {
      title = clanTxt.clancheckMultiRecruitersTitle;
      const roles = await findClanRolesWithExcessRecruiters(interaction.guild);
      lines =
        roles.length > 0
          ? roles.map(({ role, count }) => clanTxt.clancheckMultiRecruitersLine(role.name, count))
          : [clanTxt.clancheckEmpty];
    } else if (check === "leader_recruiter_overlap") {
      title = clanTxt.clancheckLeaderRecruiterOverlapTitle;
      const overlaps = await findLeaderRecruiterOverlap(interaction.guild);
      lines =
        overlaps.length > 0
          ? overlaps.map(({ member, role }) =>
              clanTxt.clancheckLeaderRecruiterLine(member.toString(), role.name),
            )
          : [clanTxt.clancheckEmpty];
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(lines.join("\n").slice(0, 4096))
      .setColor(0xfaa61a);
    await interaction.editReply({ embeds: [embed] });
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

  const msg = await channel.send({
    content: buildClanRulesHelpContent(),
    embeds: buildClanRulesHelpEmbeds(),
  });
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

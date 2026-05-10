import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Message } from "discord.js";
import { DISCORD_MODERATION_LOG_CHANNEL_ID, LAST_SEEN_STATE_FILE } from "../config";
import { logModerationEvent } from "./moderationLog";
import { adjustMinorWarningCount, getMinorWarningCount, saveState, setMinorWarningCount } from "../state";
import {
  discordModerationCommands as modTxt,
  discordModerationLogTitles,
  discordMuteDurationChoices,
  discordSlashModeration as slashModTxt,
} from "./userStrings";

function warningScopeChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string | null {
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return null;
  if ("isThread" in ch && ch.isThread()) {
    return ch.parentId ?? ch.id;
  }
  return ch.id;
}

async function tryPinTargetRecentMessage(
  interaction: ChatInputCommandInteraction,
  targetUserId: string,
): Promise<{ url?: string; error?: string }> {
  const ch = interaction.channel;
  if (!ch?.isTextBased() || !("messages" in ch)) {
    return { error: modTxt.pinChannelUnsupported };
  }
  try {
    const batch = await ch.messages.fetch({ limit: 100 });
    let best: Message | null = null;
    let bestTs = 0;
    for (const m of batch.values()) {
      if (m.author.id !== targetUserId || m.system) continue;
      const t = m.createdTimestamp;
      if (t >= bestTs) {
        bestTs = t;
        best = m;
      }
    }
    if (!best) {
      return { error: modTxt.pinNoMessage };
    }
    await best.pin();
    return { url: best.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const muteSlashCommand = new SlashCommandBuilder()
  .setName("mute")
  .setDescription(slashModTxt.mute.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addStringOption((o) =>
    o
      .setName("duration")
      .setDescription(slashModTxt.mute.duration)
      .setRequired(true)
      .addChoices(...discordMuteDurationChoices),
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription(slashModTxt.mute.reason).setMaxLength(450).setRequired(false),
  )
  .addAttachmentOption((o) =>
    o.setName("screenshot").setDescription(slashModTxt.mute.screenshot).setRequired(false),
  )
  .addBooleanOption((o) =>
    o
      .setName("pin_last_message")
      .setDescription(slashModTxt.mute.pinLastMessage)
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const unmuteSlashCommand = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription(slashModTxt.unmute.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const warnSlashCommand = new SlashCommandBuilder()
  .setName("warn")
  .setDescription(slashModTxt.warn.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription(slashModTxt.warn.channel)
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
      )
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription(slashModTxt.warn.amount).setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription(slashModTxt.warn.reason).setMaxLength(450).setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const unwarnSlashCommand = new SlashCommandBuilder()
  .setName("unwarn")
  .setDescription(slashModTxt.unwarn.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription(slashModTxt.unwarn.channel)
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
      )
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription(slashModTxt.unwarn.amount).setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addBooleanOption((o) =>
    o.setName("clear").setDescription(slashModTxt.unwarn.clear).setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

async function resolveWarningScope(
  interaction: ChatInputCommandInteraction,
  channelOptId: string | null,
): Promise<{ scopeId: string } | { error: string }> {
  if (!interaction.guildId) return { error: modTxt.guildOnly };
  if (channelOptId) {
    const fetched = await interaction.guild!.channels.fetch(channelOptId).catch(() => null);
    if (!fetched?.isTextBased()) return { error: modTxt.scopeNeedTextChannel };
    if ("isThread" in fetched && fetched.isThread()) {
      return { scopeId: fetched.parentId ?? fetched.id };
    }
    return { scopeId: fetched.id };
  }
  const scope = warningScopeChannelIdFromInteraction(interaction);
  if (!scope) return { error: modTxt.scopeChannelUnknown };
  return { scopeId: scope };
}

export async function handleModerationSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.reply({ content: modTxt.guildOnly, flags: MessageFlags.Ephemeral });
    return;
  }

  const name = interaction.commandName;
  if (name === "mute") {
    const target = interaction.options.getUser("user", true);
    const durationRaw = interaction.options.getString("duration", true);
    const minutes = parseInt(durationRaw, 10);
    const reason = interaction.options.getString("reason")?.trim() || modTxt.defaultMuteReason;
    const screenshot = interaction.options.getAttachment("screenshot");
    const pinLast = interaction.options.getBoolean("pin_last_message") === true;
    if (target.bot) {
      await interaction.reply({ content: modTxt.muteBot, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 40320) {
      await interaction.reply({ content: modTxt.badDuration, flags: MessageFlags.Ephemeral });
      return;
    }
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      await interaction.reply({ content: modTxt.userNotInGuild, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!member.moderatable) {
      await interaction.reply({ content: modTxt.muteNotModeratable, flags: MessageFlags.Ephemeral });
      return;
    }
    const ms = Math.min(minutes * 60_000, 2_419_200_000);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(ms, reason);
    } catch (err) {
      await interaction.editReply({
        content: modTxt.muteTimeoutFail(err instanceof Error ? err.message : String(err)),
      });
      return;
    }
    await saveState(LAST_SEEN_STATE_FILE);

    let pinnedEvidenceUrl: string | undefined;
    let pinNote = "";
    if (pinLast) {
      const pinResult = await tryPinTargetRecentMessage(interaction, target.id);
      if (pinResult.url) {
        pinnedEvidenceUrl = pinResult.url;
        pinNote = modTxt.pinSuccessNote(pinResult.url);
      } else {
        pinNote = modTxt.pinFailNote(pinResult.error ?? modTxt.unknownError);
      }
    }

    const logFiles =
      screenshot?.url && screenshot.name
        ? [{ url: screenshot.url, name: screenshot.name }]
        : screenshot?.url
          ? [{ url: screenshot.url, name: modTxt.screenshotFileFallback }]
          : undefined;

    await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffMute,
      color: 0x9966cc,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason,
      staffUserId: interaction.user.id,
      timeoutMs: ms,
      ...(logFiles ? { logFiles } : {}),
      ...(pinnedEvidenceUrl ? { pinnedEvidenceUrl } : {}),
    });

    const durLabel =
      discordMuteDurationChoices.find((c) => c.value === String(minutes))?.name ?? modTxt.minutesFallback(minutes);
    let shotNote = "";
    if (screenshot) {
      shotNote = DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.screenshotLogged : modTxt.screenshotNoLogEnv;
    }

    await interaction.editReply({
      content: modTxt.muteDone(durLabel, target.id, pinNote, shotNote),
    });
    return;
  }

  if (name === "unmute") {
    const target = interaction.options.getUser("user", true);
    if (target.bot) {
      await interaction.reply({ content: modTxt.unmuteBadTarget, flags: MessageFlags.Ephemeral });
      return;
    }
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      await interaction.reply({ content: modTxt.userNotInGuild, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!member.moderatable) {
      await interaction.reply({ content: modTxt.unmuteNotModeratable, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await member.timeout(null, modTxt.unmuteReason);
    } catch (err) {
      await interaction.editReply({
        content: modTxt.unmuteFail(err instanceof Error ? err.message : String(err)),
      });
      return;
    }
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffUnmute,
      color: 0x669966,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason: modTxt.unmuteLogReason,
      staffUserId: interaction.user.id,
    });
    await interaction.editReply({ content: modTxt.unmuteDone(target.id) });
    return;
  }

  if (name === "warn") {
    const target = interaction.options.getUser("user", true);
    const chOpt = interaction.options.getChannel("channel");
    const amount = interaction.options.getInteger("amount") ?? 1;
    const reason = interaction.options.getString("reason")?.trim() || modTxt.warnDefaultReason;
    if (target.bot) {
      await interaction.reply({ content: modTxt.unmuteBadTarget, flags: MessageFlags.Ephemeral });
      return;
    }
    const resolved = await resolveWarningScope(interaction, chOpt?.id ?? null);
    if ("error" in resolved) {
      await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getMinorWarningCount(interaction.guildId, resolved.scopeId, target.id);
    const after = adjustMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, amount);
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffWarn,
      color: 0x3388cc,
      targetUserId: target.id,
      channelId: resolved.scopeId,
      reason,
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
    });
    await interaction.reply({
      content: modTxt.warnCounts(target.id, resolved.scopeId, before, after),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === "unwarn") {
    const target = interaction.options.getUser("user", true);
    const chOpt = interaction.options.getChannel("channel");
    const amount = interaction.options.getInteger("amount") ?? 1;
    const clear = interaction.options.getBoolean("clear") === true;
    if (target.bot) {
      await interaction.reply({ content: modTxt.unmuteBadTarget, flags: MessageFlags.Ephemeral });
      return;
    }
    const resolved = await resolveWarningScope(interaction, chOpt?.id ?? null);
    if ("error" in resolved) {
      await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getMinorWarningCount(interaction.guildId, resolved.scopeId, target.id);
    let after: number;
    if (clear) {
      setMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, 0);
      after = 0;
    } else {
      after = adjustMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, -amount);
    }
    await saveState(LAST_SEEN_STATE_FILE);
    await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffUnwarn,
      color: 0x888888,
      targetUserId: target.id,
      channelId: resolved.scopeId,
      reason: clear ? modTxt.unwarnReasonClear : modTxt.unwarnReasonIncrement(amount),
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
    });
    await interaction.reply({
      content: modTxt.warnCounts(target.id, resolved.scopeId, before, after),
      flags: MessageFlags.Ephemeral,
    });
  }
}

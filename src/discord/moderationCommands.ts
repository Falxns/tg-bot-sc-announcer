import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Guild, Message } from "discord.js";
import {
  DISCORD_MAJOR_TIMEOUT_LADDER_MS,
  DISCORD_MINOR_TIMEOUT_LADDER_MS,
  DISCORD_MODERATION_DECAY_MS,
  DISCORD_MODERATION_LOG_CHANNEL_ID,
  DISCORD_WARNINGS_BEFORE_TIMEOUT,
  LAST_SEEN_STATE_FILE,
} from "../config";
import { logModerationEvent } from "./moderationLog";
import {
  buildStaffManualMuteEmbed,
  buildStaffManualUnmuteEmbed,
  buildStaffManualWarnEmbed,
  notifyStaffModerationUser,
} from "./moderation";
import {
  adjustMinorWarningCount,
  consumeMinorMuteTierForApply,
  discordModerationLastViolationAt,
  getMajorMuteTier,
  getMinorMuteTier,
  getMinorWarningCount,
  guildUserKey,
  LEGACY_MINOR_WARNING_SCOPE,
  listMinorWarningEntriesForGuildUser,
  saveState,
  setMinorWarningCount,
  touchModerationViolation,
} from "../state";
import {
  discordFormatDurationRu,
  discordModerationCommands as modTxt,
  discordModerationLogTitles,
  discordMuteDurationChoices,
  discordSlashModeration as slashModTxt,
} from "./userStrings";

function isDiscordSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id.trim());
}

async function channelDisplayNameForGuildChannel(guild: Guild, channelId: string): Promise<string> {
  try {
    const ch = await guild.channels.fetch(channelId);
    if (ch && "name" in ch && typeof (ch as { name?: string }).name === "string") {
      const n = (ch as { name: string }).name.trim();
      if (n.length > 0) return n.slice(0, 100);
    }
  } catch {
    /* use id */
  }
  return channelId;
}

function warningScopeChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string | null {
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return null;
  if ("isThread" in ch && ch.isThread()) {
    return ch.parentId ?? ch.id;
  }
  return ch.id;
}

/** Plaintext snapshot for mod log (does not render embeds). */
function formatMutedUserMessageSnapshot(msg: Message): string {
  const parts: string[] = [];
  const text = msg.content?.trim() ?? "";
  if (text.length > 0) parts.push(text);
  if (msg.attachments.size > 0) {
    parts.push(
      [...msg.attachments.values()]
        .map((a) => `${a.name}: ${a.url}`)
        .join("\n"),
    );
  }
  const meta: string[] = [];
  if (msg.embeds.length > 0) meta.push(`embed ×${msg.embeds.length}`);
  if (msg.stickers.size > 0) meta.push(`стикер ×${msg.stickers.size}`);
  if (meta.length > 0) parts.push(meta.join(", "));
  if (parts.length === 0) return modTxt.muteSnapshotEmpty;
  return parts.join("\n\n");
}

async function resolveEvidenceFromMessageId(opts: {
  guild: Guild;
  fetchChannelId: string;
  targetUserId: string;
  messageIdRaw: string | undefined | null;
}): Promise<{ excerpt?: string; note: string; evidenceMessage?: Message }> {
  const raw = opts.messageIdRaw?.trim();
  if (!raw) return { note: "" };
  if (!isDiscordSnowflake(raw)) {
    return { note: modTxt.evidenceNoteInvalidId };
  }
  const channel = await opts.guild.channels.fetch(opts.fetchChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) {
    return { note: modTxt.evidenceNoteBadChannel };
  }
  try {
    const msg = await channel.messages.fetch(raw);
    if (msg.author.id !== opts.targetUserId) {
      return { note: modTxt.evidenceNoteWrongAuthor };
    }
    return {
      excerpt: formatMutedUserMessageSnapshot(msg),
      note: DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.evidenceCopiedNote : modTxt.evidenceNoLogEnv,
      evidenceMessage: msg,
    };
  } catch {
    return { note: modTxt.evidenceNoteFetchFail };
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
  .addStringOption((o) =>
    o
      .setName("message_id")
      .setDescription(slashModTxt.mute.messageId)
      .setRequired(false)
      .setMinLength(17)
      .setMaxLength(22),
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
  .addAttachmentOption((o) =>
    o.setName("screenshot").setDescription(slashModTxt.warn.screenshot).setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("message_id")
      .setDescription(slashModTxt.warn.messageId)
      .setRequired(false)
      .setMinLength(17)
      .setMaxLength(22),
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

export const modstatusSlashCommand = new SlashCommandBuilder()
  .setName("modstatus")
  .setDescription(slashModTxt.modstatus.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.modstatus.user).setRequired(true))
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
    const messageIdRaw = interaction.options.getString("message_id")?.trim();
    if (messageIdRaw && !isDiscordSnowflake(messageIdRaw)) {
      await interaction.reply({ content: modTxt.evidenceInvalidSnowflakeReply, flags: MessageFlags.Ephemeral });
      return;
    }
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

    const channelNameForDm = await channelDisplayNameForGuildChannel(guild, interaction.channelId);
    const muteDm = buildStaffManualMuteEmbed({
      guild,
      member,
      channelName: channelNameForDm,
      reason,
      timeoutMs: ms,
    });
    void notifyStaffModerationUser(interaction, member, muteDm).catch((err) => {
      console.error("staff /mute DM notify failed:", err);
    });

    const evidence = await resolveEvidenceFromMessageId({
      guild,
      fetchChannelId: interaction.channelId,
      targetUserId: target.id,
      messageIdRaw,
    });

    await saveState(LAST_SEEN_STATE_FILE);

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
      ...(evidence.excerpt !== undefined ? { messageExcerpt: evidence.excerpt } : {}),
    });

    let evidenceDeleteNote = "";
    if (evidence.evidenceMessage) {
      try {
        await evidence.evidenceMessage.delete();
        evidenceDeleteNote = modTxt.evidenceSourceDeletedNote;
      } catch (err) {
        console.error("moderation evidence message delete failed:", err);
        evidenceDeleteNote = modTxt.evidenceSourceDeleteFailNote;
      }
    }

    const durLabel =
      discordMuteDurationChoices.find((c) => c.value === String(minutes))?.name ?? modTxt.minutesFallback(minutes);
    let shotNote = "";
    if (screenshot) {
      shotNote = DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.screenshotLogged : modTxt.screenshotNoLogEnv;
    }

    await interaction.editReply({
      content: modTxt.muteDone(durLabel, target.id, evidence.note + evidenceDeleteNote, shotNote),
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
    const unmuteChannelName = await channelDisplayNameForGuildChannel(guild, interaction.channelId);
    const unmuteDm = buildStaffManualUnmuteEmbed({
      guild,
      member,
      channelName: unmuteChannelName,
    });
    void notifyStaffModerationUser(interaction, member, unmuteDm).catch((err) => {
      console.error("staff /unmute DM notify failed:", err);
    });
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
    const screenshot = interaction.options.getAttachment("screenshot");
    const messageIdRaw = interaction.options.getString("message_id")?.trim();
    if (target.bot) {
      await interaction.reply({ content: modTxt.unmuteBadTarget, flags: MessageFlags.Ephemeral });
      return;
    }
    if (messageIdRaw && !isDiscordSnowflake(messageIdRaw)) {
      await interaction.reply({ content: modTxt.evidenceInvalidSnowflakeReply, flags: MessageFlags.Ephemeral });
      return;
    }
    const resolved = await resolveWarningScope(interaction, chOpt?.id ?? null);
    if ("error" in resolved) {
      await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getMinorWarningCount(interaction.guildId, resolved.scopeId, target.id);
    const after = adjustMinorWarningCount(interaction.guildId, resolved.scopeId, target.id, amount);

    let timeoutMs: number | undefined;
    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      member = null;
    }

    /** Same rule as automod minor path: ladder timeout whenever warnings stay at/above threshold after this `/warn`. */
    const applyMinorLadderTimeout =
      after >= DISCORD_WARNINGS_BEFORE_TIMEOUT && member !== null && member.moderatable;

    if (applyMinorLadderTimeout && member) {
      const lastMinorIdx = DISCORD_MINOR_TIMEOUT_LADDER_MS.length - 1;
      const tb = getMinorMuteTier(guild.id, target.id);
      const idx = Math.min(tb, lastMinorIdx);
      const ms = DISCORD_MINOR_TIMEOUT_LADDER_MS[idx] ?? DISCORD_MINOR_TIMEOUT_LADDER_MS[lastMinorIdx];
      try {
        await member.timeout(
          ms,
          modTxt.warnThresholdTimeoutReason(reason, DISCORD_WARNINGS_BEFORE_TIMEOUT),
        );
        consumeMinorMuteTierForApply(guild.id, target.id, lastMinorIdx);
        timeoutMs = ms;
      } catch (err) {
        console.error("Discord manual warn threshold timeout failed:", err);
      }
    }

    touchModerationViolation(guild.id, target.id, Date.now());
    await saveState(LAST_SEEN_STATE_FILE);

    const evidence = await resolveEvidenceFromMessageId({
      guild,
      fetchChannelId: interaction.channelId,
      targetUserId: target.id,
      messageIdRaw,
    });

    const logFiles =
      screenshot?.url && screenshot.name
        ? [{ url: screenshot.url, name: screenshot.name }]
        : screenshot?.url
          ? [{ url: screenshot.url, name: modTxt.screenshotFileFallback }]
          : undefined;

    await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffWarn,
      color: 0x3388cc,
      targetUserId: target.id,
      channelId: resolved.scopeId,
      reason,
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(logFiles ? { logFiles } : {}),
      ...(evidence.excerpt !== undefined ? { messageExcerpt: evidence.excerpt } : {}),
    });

    let evidenceDeleteNote = "";
    if (evidence.evidenceMessage) {
      try {
        await evidence.evidenceMessage.delete();
        evidenceDeleteNote = modTxt.evidenceSourceDeletedNote;
      } catch (err) {
        console.error("moderation evidence message delete failed:", err);
        evidenceDeleteNote = modTxt.evidenceSourceDeleteFailNote;
      }
    }

    if (member) {
      const warnChannelName = await channelDisplayNameForGuildChannel(guild, resolved.scopeId);
      const warnDm = buildStaffManualWarnEmbed({
        guild,
        member,
        channelName: warnChannelName,
        reason,
        warnCount: after,
        timeoutMs,
      });
      void notifyStaffModerationUser(interaction, member, warnDm).catch((err) => {
        console.error("staff /warn DM notify failed:", err);
      });
    }

    let shotNote = "";
    if (screenshot) {
      shotNote = DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.screenshotLogged : modTxt.screenshotNoLogEnv;
    }
    const timeoutNote =
      timeoutMs !== undefined ? modTxt.warnTimeoutNote(discordFormatDurationRu(timeoutMs)) : "";

    await interaction.reply({
      content: modTxt.warnDoneLine(
        modTxt.warnCounts(target.id, resolved.scopeId, before, after),
        timeoutNote,
        shotNote,
        evidence.note + evidenceDeleteNote,
      ),
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
    return;
  }

  if (name === "modstatus") {
    const target = interaction.options.getUser("user", true);
    if (target.bot) {
      await interaction.reply({ content: modTxt.modstatusBot, flags: MessageFlags.Ephemeral });
      return;
    }
    const guildId = guild.id;
    const userId = target.id;
    const entries = listMinorWarningEntriesForGuildUser(guildId, userId);
    const minorTier = getMinorMuteTier(guildId, userId);
    const majorTier = getMajorMuteTier(guildId, userId);
    const lastMinorIdx = DISCORD_MINOR_TIMEOUT_LADDER_MS.length - 1;
    const lastMajorIdx = DISCORD_MAJOR_TIMEOUT_LADDER_MS.length - 1;
    const minorNextMs =
      DISCORD_MINOR_TIMEOUT_LADDER_MS[Math.min(minorTier, lastMinorIdx)] ?? DISCORD_MINOR_TIMEOUT_LADDER_MS[lastMinorIdx];
    const majorNextMs =
      DISCORD_MAJOR_TIMEOUT_LADDER_MS[Math.min(majorTier, lastMajorIdx)] ?? DISCORD_MAJOR_TIMEOUT_LADDER_MS[lastMajorIdx];

    const lines: string[] = [];
    lines.push(modTxt.modstatusIntro(userId));
    lines.push("");

    let discordTimeoutLine: string = modTxt.modstatusDiscordTimeoutUnknown;
    try {
      const member = await guild.members.fetch({ user: userId });
      const until = member.communicationDisabledUntil;
      if (until !== null && until.getTime() > Date.now()) {
        const endUnixSec = Math.floor(until.getTime() / 1000);
        discordTimeoutLine = modTxt.modstatusDiscordTimeoutActive(endUnixSec);
      } else {
        discordTimeoutLine = modTxt.modstatusDiscordTimeoutInactive;
      }
    } catch {
      discordTimeoutLine = modTxt.modstatusDiscordTimeoutUnknown;
    }
    lines.push(discordTimeoutLine);
    lines.push("");

    lines.push(
      modTxt.modstatusMinorLadder(
        minorTier,
        discordFormatDurationRu(minorNextMs),
        DISCORD_MINOR_TIMEOUT_LADDER_MS.length,
        DISCORD_WARNINGS_BEFORE_TIMEOUT,
      ),
    );
    lines.push(
      modTxt.modstatusMajorLadder(
        majorTier,
        discordFormatDurationRu(majorNextMs),
        DISCORD_MAJOR_TIMEOUT_LADDER_MS.length,
      ),
    );
    lines.push("");
    lines.push(modTxt.modstatusWarningsHeader);
    if (entries.length === 0) {
      lines.push(modTxt.modstatusWarningsEmpty);
    } else {
      const maxLines = 20;
      for (let i = 0; i < entries.length && i < maxLines; i++) {
        const e = entries[i]!;
        const label =
          e.scopeId === LEGACY_MINOR_WARNING_SCOPE ? modTxt.modstatusLegacyScope : `<#${e.scopeId}>`;
        lines.push(`• ${label}: **${e.count}** / ${DISCORD_WARNINGS_BEFORE_TIMEOUT}`);
      }
      if (entries.length > maxLines) {
        lines.push(modTxt.modstatusWarningsTruncated(entries.length - maxLines));
      }
    }
    lines.push("");
    const lastAt = discordModerationLastViolationAt.get(guildUserKey(guildId, userId));
    const now = Date.now();
    if (lastAt === undefined) {
      lines.push(modTxt.modstatusDecayNone);
    } else {
      const since = now - lastAt;
      const agoLabel = discordFormatDurationRu(since);
      const remaining = DISCORD_MODERATION_DECAY_MS - since;
      const resetLabel =
        remaining <= 0 ? modTxt.modstatusDecayDue : modTxt.modstatusDecayPending(discordFormatDurationRu(remaining));
      lines.push(modTxt.modstatusDecayLine(agoLabel, resetLabel));
    }

    await interaction.reply({
      content: lines.join("\n").slice(0, 2000),
      flags: MessageFlags.Ephemeral,
    });
  }
}

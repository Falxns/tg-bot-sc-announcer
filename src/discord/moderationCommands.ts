import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Guild, Message, User } from "discord.js";
import {
  DISCORD_MODERATION_DECAY_MS,
  DISCORD_MODERATION_LOG_CHANNEL_ID,
  DISCORD_TIMEOUT_LADDER_MS,
  DISCORD_WARNINGS_BEFORE_TIMEOUT,
  LAST_SEEN_STATE_FILE,
} from "../config";
import { logModerationEvent, postStaffModerationSummary } from "./moderationLog";
import { ladderDurationMs, lastLadderIndex } from "./moderationLadder";
import {
  applyManualMuteSanction,
  applyStrikeModerationSanction,
} from "./moderationSanction";
import {
  buildStaffManualBanEmbed,
  buildStaffManualMuteEmbed,
  buildStaffManualStrikeEmbed,
  buildStaffManualUnbanEmbed,
  buildStaffManualUnmuteEmbed,
  notifyStaffModerationUser,
  notifyStaffUserDmFallback,
} from "./moderation";
import {
  adjustGlobalWarnCount,
  applyModerationDecayIfNeeded,
  discordModerationLastViolationAt,
  getGlobalWarnCount,
  getMuteTier,
  guildUserKey,
  saveState,
  setGlobalWarnCount,
  touchModerationViolation,
} from "../state";
import {
  filterReasonPresetAutocomplete,
  isKnownReasonPresetId,
  reasonPlainTextForAudit,
  resolveModerationReason,
} from "./moderationReasonPresets";
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

function warningScopeChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string | null {
  const ch = interaction.channel;
  if (!ch?.isTextBased()) return null;
  if ("isThread" in ch && ch.isThread()) {
    return ch.parentId ?? ch.id;
  }
  return ch.id;
}

function moderationScopeChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string {
  return warningScopeChannelIdFromInteraction(interaction) ?? interaction.channelId;
}

function resolveStaffModerationReason(
  interaction: ChatInputCommandInteraction,
  scopeChannelId: string,
  defaultReason: string,
): string {
  const presetRaw = interaction.options.getString("reason_preset");
  const presetId = presetRaw && isKnownReasonPresetId(presetRaw) ? presetRaw : undefined;
  return resolveModerationReason({
    custom: interaction.options.getString("reason"),
    presetId,
    scopeChannelId,
    defaultReason,
  });
}

export async function handleModerationAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const cmd = interaction.commandName;
  if (cmd !== "mute" && cmd !== "strike" && cmd !== "ban") {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "reason_preset") {
    await interaction.respond([]);
    return;
  }
  const choices = filterReasonPresetAutocomplete(typeof focused.value === "string" ? focused.value : "");
  await interaction.respond(choices);
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
    o
      .setName("reason_preset")
      .setDescription(slashModTxt.mute.reasonPreset)
      .setAutocomplete(true)
      .setRequired(false),
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

export const strikeSlashCommand = new SlashCommandBuilder()
  .setName("strike")
  .setDescription(slashModTxt.strike.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription(slashModTxt.strike.amount).setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("reason_preset")
      .setDescription(slashModTxt.strike.reasonPreset)
      .setAutocomplete(true)
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription(slashModTxt.strike.reason).setMaxLength(450).setRequired(false),
  )
  .addAttachmentOption((o) =>
    o.setName("screenshot").setDescription(slashModTxt.strike.screenshot).setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("message_id")
      .setDescription(slashModTxt.strike.messageId)
      .setRequired(false)
      .setMinLength(17)
      .setMaxLength(22),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const unwarnSlashCommand = new SlashCommandBuilder()
  .setName("unwarn")
  .setDescription(slashModTxt.unwarn.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription(slashModTxt.unwarn.amount).setMinValue(1).setMaxValue(20).setRequired(false),
  )
  .addBooleanOption((o) =>
    o.setName("clear").setDescription(slashModTxt.unwarn.clear).setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const banSlashCommand = new SlashCommandBuilder()
  .setName("ban")
  .setDescription(slashModTxt.ban.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.userOption).setRequired(true))
  .addStringOption((o) =>
    o
      .setName("reason_preset")
      .setDescription(slashModTxt.ban.reasonPreset)
      .setAutocomplete(true)
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription(slashModTxt.ban.reason).setMaxLength(450).setRequired(false),
  )
  .addAttachmentOption((o) =>
    o.setName("screenshot").setDescription(slashModTxt.ban.screenshot).setRequired(false),
  )
  .addStringOption((o) =>
    o
      .setName("message_id")
      .setDescription(slashModTxt.ban.messageId)
      .setRequired(false)
      .setMinLength(17)
      .setMaxLength(22),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export const unbanSlashCommand = new SlashCommandBuilder()
  .setName("unban")
  .setDescription(slashModTxt.unban.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.unban.user).setRequired(false))
  .addStringOption((o) =>
    o
      .setName("user_id")
      .setDescription(slashModTxt.unban.userId)
      .setRequired(false)
      .setMinLength(17)
      .setMaxLength(22),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export const modstatusSlashCommand = new SlashCommandBuilder()
  .setName("modstatus")
  .setDescription(slashModTxt.modstatus.commandDescription)
  .addUserOption((o) => o.setName("user").setDescription(slashModTxt.modstatus.user).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

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
    const scopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const reason = resolveStaffModerationReason(interaction, scopeChannelId, modTxt.defaultMuteReason);
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
    const now = Date.now();
    applyModerationDecayIfNeeded(guild.id, target.id, now, DISCORD_MODERATION_DECAY_MS);
    const sanction = await applyManualMuteSanction({
      guildId: guild.id,
      userId: target.id,
      member,
      durationMs: ms,
      reason,
    });
    if (sanction.outcome !== "applied") {
      await interaction.editReply({
        content:
          sanction.outcome === "not_moderatable"
            ? modTxt.muteNotModeratable
            : modTxt.muteTimeoutFail(modTxt.unknownError),
      });
      return;
    }
    touchModerationViolation(guild.id, target.id, now);

    const muteDm = buildStaffManualMuteEmbed({
      guild,
      member,
      channelId: scopeChannelId,
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

    const logMsg = await logModerationEvent(guild, {
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

    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "mute",
      logMessage: logMsg,
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
    const unmuteScopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const unmuteDm = buildStaffManualUnmuteEmbed({
      guild,
      member,
      channelId: unmuteScopeChannelId,
    });
    void notifyStaffModerationUser(interaction, member, unmuteDm).catch((err) => {
      console.error("staff /unmute DM notify failed:", err);
    });
    await saveState(LAST_SEEN_STATE_FILE);
    const logMsgUnmute = await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffUnmute,
      color: 0x669966,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason: modTxt.unmuteLogReason,
      staffUserId: interaction.user.id,
    });
    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "unmute",
      logMessage: logMsgUnmute,
    });
    await interaction.editReply({ content: modTxt.unmuteDone(target.id) });
    return;
  }

  if (name === "strike") {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount") ?? 1;
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
    const scopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const reason = resolveStaffModerationReason(interaction, scopeChannelId, modTxt.strikeDefaultReason);
    const before = getGlobalWarnCount(guild.id, target.id);

    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch({ user: target.id });
    } catch {
      await interaction.reply({ content: modTxt.userNotInGuild, flags: MessageFlags.Ephemeral });
      return;
    }

    const now = Date.now();
    applyModerationDecayIfNeeded(guild.id, target.id, now, DISCORD_MODERATION_DECAY_MS);
    const strike = await applyStrikeModerationSanction({
      guildId: guild.id,
      userId: target.id,
      member,
      reason,
      warnAmount: amount,
      timeoutAuditReason: modTxt.strikeThresholdTimeoutReason(reason, DISCORD_WARNINGS_BEFORE_TIMEOUT),
    });
    touchModerationViolation(guild.id, target.id, now);
    const after = strike.warnCount;
    const timeoutMs = strike.timeoutApplied ? strike.timeoutMs : undefined;

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

    const logMsgStrike = await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffStrike,
      color: 0x3388cc,
      targetUserId: target.id,
      channelId: scopeChannelId,
      reason,
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(logFiles ? { logFiles } : {}),
      ...(evidence.excerpt !== undefined ? { messageExcerpt: evidence.excerpt } : {}),
    });

    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "strike",
      logMessage: logMsgStrike,
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

    const strikeDm = buildStaffManualStrikeEmbed({
      guild,
      member,
      channelId: scopeChannelId,
      reason,
      timeoutMs,
    });
    void notifyStaffModerationUser(interaction, member, strikeDm).catch((err) => {
      console.error("staff /strike DM notify failed:", err);
    });

    let shotNote = "";
    if (screenshot) {
      shotNote = DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.screenshotLogged : modTxt.screenshotNoLogEnv;
    }
    const timeoutNote =
      timeoutMs !== undefined ? modTxt.strikeTimeoutNote(discordFormatDurationRu(timeoutMs)) : "";

    await interaction.reply({
      content: modTxt.strikeDoneLine(
        modTxt.strikeCounts(target.id, before, after, DISCORD_WARNINGS_BEFORE_TIMEOUT),
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
    const amount = interaction.options.getInteger("amount") ?? 1;
    const clear = interaction.options.getBoolean("clear") === true;
    if (target.bot) {
      await interaction.reply({ content: modTxt.unmuteBadTarget, flags: MessageFlags.Ephemeral });
      return;
    }
    const before = getGlobalWarnCount(guild.id, target.id);
    let after: number;
    if (clear) {
      after = setGlobalWarnCount(guild.id, target.id, 0);
    } else {
      after = adjustGlobalWarnCount(guild.id, target.id, -amount);
    }
    await saveState(LAST_SEEN_STATE_FILE);
    const scopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const logMsgUnwarn = await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffUnwarn,
      color: 0x888888,
      targetUserId: target.id,
      channelId: scopeChannelId,
      reason: clear ? modTxt.unwarnReasonClear : modTxt.unwarnReasonIncrement(amount),
      minorWarningsInChannel: after,
      staffUserId: interaction.user.id,
    });
    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "unwarn",
      logMessage: logMsgUnwarn,
    });
    await interaction.reply({
      content: modTxt.strikeCounts(target.id, before, after, DISCORD_WARNINGS_BEFORE_TIMEOUT),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === "ban") {
    const target = interaction.options.getUser("user", true);
    const banScopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const reason = resolveStaffModerationReason(interaction, banScopeChannelId, modTxt.defaultBanReason);
    const screenshot = interaction.options.getAttachment("screenshot");
    const messageIdRaw = interaction.options.getString("message_id")?.trim();
    if (messageIdRaw && !isDiscordSnowflake(messageIdRaw)) {
      await interaction.reply({ content: modTxt.evidenceInvalidSnowflakeReply, flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.id === interaction.user.id) {
      await interaction.reply({ content: modTxt.banSelf, flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.id === guild.ownerId) {
      await interaction.reply({ content: modTxt.banOwner, flags: MessageFlags.Ephemeral });
      return;
    }
    const member: GuildMember | null = await guild.members.fetch({ user: target.id }).catch(() => null);
    if (member && !member.bannable) {
      await interaction.reply({ content: modTxt.banNotBannable, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const banDmEmbed = buildStaffManualBanEmbed({
      guild,
      targetUser: target,
      member,
      channelId: banScopeChannelId,
      reason,
    });
    await notifyStaffUserDmFallback(interaction, target, banDmEmbed);
    try {
      await guild.members.ban(target.id, { reason: reasonPlainTextForAudit(reason) });
    } catch (err) {
      await interaction.editReply({
        content: modTxt.banFail(err instanceof Error ? err.message : String(err)),
      });
      return;
    }

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

    const logMsg = await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffBan,
      color: 0x992222,
      targetUserId: target.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason,
      staffUserId: interaction.user.id,
      ...(logFiles ? { logFiles } : {}),
      ...(evidence.excerpt !== undefined ? { messageExcerpt: evidence.excerpt } : {}),
    });

    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "ban",
      logMessage: logMsg,
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

    let shotNote = "";
    if (screenshot) {
      shotNote = DISCORD_MODERATION_LOG_CHANNEL_ID ? modTxt.screenshotLogged : modTxt.screenshotNoLogEnv;
    }

    await interaction.editReply({
      content: modTxt.banDone(target.id, evidence.note + evidenceDeleteNote, shotNote),
    });
    return;
  }

  if (name === "unban") {
    const userOpt = interaction.options.getUser("user");
    const userIdRaw = interaction.options.getString("user_id")?.trim();
    if (userOpt && userIdRaw) {
      await interaction.reply({ content: modTxt.unbanBothTargets, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!userOpt && !userIdRaw) {
      await interaction.reply({ content: modTxt.unbanNeedExactlyOneTarget, flags: MessageFlags.Ephemeral });
      return;
    }

    let targetUser: User;
    if (userIdRaw) {
      if (!isDiscordSnowflake(userIdRaw)) {
        await interaction.reply({ content: modTxt.evidenceInvalidSnowflakeReply, flags: MessageFlags.Ephemeral });
        return;
      }
      try {
        targetUser = await interaction.client.users.fetch(userIdRaw);
      } catch {
        await interaction.reply({ content: modTxt.unbanUserUnknown, flags: MessageFlags.Ephemeral });
        return;
      }
    } else {
      targetUser = userOpt!;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await guild.bans.remove(targetUser.id);
    } catch (err: unknown) {
      const code = typeof err === "object" && err !== null && "code" in err ? (err as { code?: number }).code : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      const unknownBan =
        code === 10026 || msg.includes("Unknown Ban") || msg.toLowerCase().includes("unknown ban");
      await interaction.editReply({
        content: unknownBan ? modTxt.unbanNotBanned : modTxt.unbanFail(msg),
      });
      return;
    }

    const unbanScopeChannelId = moderationScopeChannelIdFromInteraction(interaction);
    const unbanDm = buildStaffManualUnbanEmbed({
      guild,
      user: targetUser,
      channelId: unbanScopeChannelId,
    });
    await notifyStaffUserDmFallback(interaction, targetUser, unbanDm);

    const logMsgUnban = await logModerationEvent(guild, {
      title: discordModerationLogTitles.staffUnban,
      color: 0x449944,
      targetUserId: targetUser.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.isThread() ? interaction.channel.parentId ?? undefined : undefined,
      reason: modTxt.unbanLogReason,
      staffUserId: interaction.user.id,
    });
    await postStaffModerationSummary(guild, {
      staffUserId: interaction.user.id,
      action: "unban",
      logMessage: logMsgUnban,
    });
    await interaction.editReply({ content: modTxt.unbanDone(targetUser.id) });
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
    const warnCount = getGlobalWarnCount(guildId, userId);
    const tier = getMuteTier(guildId, userId);
    const lastIdx = lastLadderIndex();
    const nextMs = ladderDurationMs(Math.min(tier, lastIdx));

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
      modTxt.modstatusGlobalWarns(warnCount, DISCORD_WARNINGS_BEFORE_TIMEOUT),
    );
    lines.push(
      modTxt.modstatusLadder(
        tier,
        discordFormatDurationRu(nextMs),
        DISCORD_TIMEOUT_LADDER_MS.length,
        DISCORD_WARNINGS_BEFORE_TIMEOUT,
      ),
    );
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

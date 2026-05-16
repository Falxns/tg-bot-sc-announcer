import { EmbedBuilder, Guild, type ColorResolvable, type Message } from "discord.js";
import {
  DISCORD_MODERATION_LOG_CHANNEL_ID,
  DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID,
  DISCORD_WARNINGS_BEFORE_TIMEOUT,
} from "../config";
import {
  discordModerationLogChannelFieldValue,
  discordModerationLogFields,
  discordStaffModerationSummary as staffSumTxt,
} from "./userStrings";

export type ModerationLogPayload = {
  title: string;
  color?: ColorResolvable;
  targetUserId: string;
  channelId?: string;
  parentChannelId?: string;
  reason: string;
  minorWarningsInChannel?: number;
  timeoutMs?: number;
  messageExcerpt?: string;
  staffUserId?: string;
  /** Remote attachment(s) for the log message (e.g. /mute screenshot). */
  logFiles?: { url: string; name: string }[];
};

export async function logModerationEvent(guild: Guild, payload: ModerationLogPayload): Promise<Message | undefined> {
  if (!DISCORD_MODERATION_LOG_CHANNEL_ID) return undefined;
  const ch = await guild.channels.fetch(DISCORD_MODERATION_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return undefined;

  const embed = new EmbedBuilder()
    .setTitle(payload.title.slice(0, 256))
    .setDescription("**Причина:** " + payload.reason.slice(0, 4096))
    .addFields({
      name: discordModerationLogFields.user,
      value: `<@${payload.targetUserId}>`,
      inline: false,
    });

  if (payload.channelId) {
    embed.addFields({
      name: discordModerationLogFields.channel,
      value: discordModerationLogChannelFieldValue(payload.channelId, payload.parentChannelId),
      inline: false,
    });
  }
  if (payload.minorWarningsInChannel !== undefined) {
    embed.addFields({
      name: discordModerationLogFields.minorWarningsChannel,
      value: `${payload.minorWarningsInChannel}/${DISCORD_WARNINGS_BEFORE_TIMEOUT}`,
      inline: true,
    });
  }
  if (payload.timeoutMs !== undefined) {
    embed.addFields({
      name: discordModerationLogFields.timeout,
      value: discordModerationLogFields.timeoutMinutes(Math.round(payload.timeoutMs / 60000)),
      inline: true,
    });
  }
  if (payload.messageExcerpt) {
    embed.addFields({
      name: discordModerationLogFields.excerpt,
      value: payload.messageExcerpt.slice(0, 1000),
      inline: false,
    });
  }
  if (payload.staffUserId) {
    embed.addFields({
      name: discordModerationLogFields.moderator,
      value: `<@${payload.staffUserId}>`,
      inline: false,
    });
  }
  if (payload.color !== undefined) embed.setColor(payload.color);
  embed.setTimestamp(new Date());

  const files = payload.logFiles?.length
    ? payload.logFiles.map((f) => ({ attachment: f.url, name: f.name.slice(0, 80) || "file" }))
    : undefined;

  try {
    return await ch.send({ embeds: [embed], ...(files?.length ? { files } : {}) });
  } catch (err) {
    console.error("Moderation log channel send failed:", err);
    return undefined;
  }
}

export type StaffModerationSummaryAction = "mute" | "unmute" | "strike" | "unwarn" | "ban" | "unban";

/** One-line digest for staff (manual commands only). Requires both log channel message id and env summary channel. */
export async function postStaffModerationSummary(
  guild: Guild,
  opts: { staffUserId: string; action: StaffModerationSummaryAction; logMessage: Message | undefined },
): Promise<void> {
  if (!DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID || !opts.logMessage?.id) return;
  const logChannelId = DISCORD_MODERATION_LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const ch = await guild.channels.fetch(DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return;

  const url = `https://discord.com/channels/${guild.id}/${logChannelId}/${opts.logMessage.id}`;
  const id = opts.staffUserId;
  let content: string;
  switch (opts.action) {
    case "mute":
      content = staffSumTxt.lineMute(id, url);
      break;
    case "unmute":
      content = staffSumTxt.lineUnmute(id, url);
      break;
    case "strike":
      content = staffSumTxt.lineStrike(id, url);
      break;
    case "unwarn":
      content = staffSumTxt.lineUnwarn(id, url);
      break;
    case "ban":
      content = staffSumTxt.lineBan(id, url);
      break;
    case "unban":
      content = staffSumTxt.lineUnban(id, url);
      break;
    default:
      return;
  }

  try {
    await ch.send({ content: content.slice(0, 2000) });
  } catch (err) {
    console.error("Moderation staff summary channel send failed:", err);
  }
}

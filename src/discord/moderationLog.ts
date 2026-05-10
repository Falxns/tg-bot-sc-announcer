import { EmbedBuilder, Guild, type ColorResolvable } from "discord.js";
import { DISCORD_MODERATION_LOG_CHANNEL_ID } from "../config";
import {
  discordModerationLogChannelFieldValue,
  discordModerationLogFields,
} from "./userStrings";

export type ModerationLogPayload = {
  title: string;
  color?: ColorResolvable;
  targetUserId: string;
  channelId?: string;
  parentChannelId?: string;
  reason: string;
  severity?: string;
  minorWarningsInChannel?: number;
  minorMuteTierBefore?: number;
  minorMuteTierAfter?: number;
  majorMuteTierBefore?: number;
  majorMuteTierAfter?: number;
  timeoutMs?: number;
  messageId?: string;
  messageExcerpt?: string;
  staffUserId?: string;
  /** Remote attachment(s) for the log message (e.g. /mute screenshot). */
  logFiles?: { url: string; name: string }[];
};

export async function logModerationEvent(guild: Guild, payload: ModerationLogPayload): Promise<void> {
  if (!DISCORD_MODERATION_LOG_CHANNEL_ID) return;
  const ch = await guild.channels.fetch(DISCORD_MODERATION_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return;

  const embed = new EmbedBuilder()
    .setTitle(payload.title.slice(0, 256))
    .setDescription(payload.reason.slice(0, 4096))
    .addFields({
      name: discordModerationLogFields.user,
      value: `<@${payload.targetUserId}> (\`${payload.targetUserId}\`)`,
      inline: false,
    });

  if (payload.channelId) {
    embed.addFields({
      name: discordModerationLogFields.channel,
      value: discordModerationLogChannelFieldValue(payload.channelId, payload.parentChannelId),
      inline: false,
    });
  }
  if (payload.severity)
    embed.addFields({ name: discordModerationLogFields.type, value: payload.severity, inline: true });
  if (payload.minorWarningsInChannel !== undefined) {
    embed.addFields({
      name: discordModerationLogFields.minorWarningsChannel,
      value: String(payload.minorWarningsInChannel),
      inline: true,
    });
  }
  if (payload.minorMuteTierBefore !== undefined && payload.minorMuteTierAfter !== undefined) {
    embed.addFields({
      name: discordModerationLogFields.minorTier,
      value: `${payload.minorMuteTierBefore} → ${payload.minorMuteTierAfter}`,
      inline: true,
    });
  }
  if (payload.majorMuteTierBefore !== undefined && payload.majorMuteTierAfter !== undefined) {
    embed.addFields({
      name: discordModerationLogFields.majorTier,
      value: `${payload.majorMuteTierBefore} → ${payload.majorMuteTierAfter}`,
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
  if (payload.messageId && payload.channelId) {
    embed.addFields({
      name: discordModerationLogFields.message,
      value: `https://discord.com/channels/${guild.id}/${payload.channelId}/${payload.messageId}`,
      inline: false,
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

  await ch.send({ embeds: [embed], ...(files?.length ? { files } : {}) }).catch((err) => {
    console.error("Moderation log channel send failed:", err);
  });
}

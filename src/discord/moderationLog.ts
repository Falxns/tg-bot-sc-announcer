import { EmbedBuilder, Guild, type ColorResolvable } from "discord.js";
import { DISCORD_MODERATION_LOG_CHANNEL_ID, DISCORD_WARNINGS_BEFORE_TIMEOUT } from "../config";
import { discordModerationLogChannelFieldValue, discordModerationLogFields } from "./userStrings";

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

export async function logModerationEvent(guild: Guild, payload: ModerationLogPayload): Promise<void> {
  if (!DISCORD_MODERATION_LOG_CHANNEL_ID) return;
  const ch = await guild.channels.fetch(DISCORD_MODERATION_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return;

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

  await ch.send({ embeds: [embed], ...(files?.length ? { files } : {}) }).catch((err) => {
    console.error("Moderation log channel send failed:", err);
  });
}

import { EmbedBuilder, Guild, type ColorResolvable } from "discord.js";
import { DISCORD_MODERATION_LOG_CHANNEL_ID } from "../config";

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
};

export async function logModerationEvent(guild: Guild, payload: ModerationLogPayload): Promise<void> {
  if (!DISCORD_MODERATION_LOG_CHANNEL_ID) return;
  const ch = await guild.channels.fetch(DISCORD_MODERATION_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return;

  const embed = new EmbedBuilder()
    .setTitle(payload.title.slice(0, 256))
    .setDescription(payload.reason.slice(0, 4096))
    .addFields({ name: "Пользователь", value: `<@${payload.targetUserId}> (\`${payload.targetUserId}\`)`, inline: false });

  if (payload.channelId) {
    embed.addFields({
      name: "Канал",
      value: payload.parentChannelId
        ? `<#${payload.channelId}> (ветка, родитель <#${payload.parentChannelId}>)`
        : `<#${payload.channelId}>`,
      inline: false,
    });
  }
  if (payload.severity) embed.addFields({ name: "Тип", value: payload.severity, inline: true });
  if (payload.minorWarningsInChannel !== undefined) {
    embed.addFields({ name: "Предупреждений (минор, канал)", value: String(payload.minorWarningsInChannel), inline: true });
  }
  if (payload.minorMuteTierBefore !== undefined && payload.minorMuteTierAfter !== undefined) {
    embed.addFields({
      name: "Minor tier",
      value: `${payload.minorMuteTierBefore} → ${payload.minorMuteTierAfter}`,
      inline: true,
    });
  }
  if (payload.majorMuteTierBefore !== undefined && payload.majorMuteTierAfter !== undefined) {
    embed.addFields({
      name: "Major tier",
      value: `${payload.majorMuteTierBefore} → ${payload.majorMuteTierAfter}`,
      inline: true,
    });
  }
  if (payload.timeoutMs !== undefined) {
    embed.addFields({ name: "Таймаут", value: `${Math.round(payload.timeoutMs / 60000)} мин`, inline: true });
  }
  if (payload.messageId && payload.channelId) {
    embed.addFields({
      name: "Сообщение",
      value: `https://discord.com/channels/${guild.id}/${payload.channelId}/${payload.messageId}`,
      inline: false,
    });
  }
  if (payload.messageExcerpt) {
    embed.addFields({ name: "Фрагмент", value: payload.messageExcerpt.slice(0, 1000), inline: false });
  }
  if (payload.staffUserId) {
    embed.addFields({ name: "Модератор", value: `<@${payload.staffUserId}>`, inline: false });
  }
  if (payload.color !== undefined) embed.setColor(payload.color);
  embed.setTimestamp(new Date());

  await ch.send({ embeds: [embed] }).catch((err) => {
    console.error("Moderation log channel send failed:", err);
  });
}

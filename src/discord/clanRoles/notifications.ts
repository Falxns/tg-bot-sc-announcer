import type { Guild, Message, TextChannel } from "discord.js";
import { DISCORD_CLAN_NOTIFICATIONS_CHANNEL_ID } from "../../config";
import { replyToClanRequestMessage } from "./helpers";

export async function deleteClanThreadMessage(
  guild: Guild,
  channelId: string,
  messageId: string | undefined,
): Promise<void> {
  if (!messageId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  await msg?.delete().catch(() => undefined);
}

/** Remove pending approval embed from the rules thread after resolve. */
export async function clearClanPendingEmbed(
  message: Message,
  guild: Guild,
  channelId: string,
  pendingMessageId?: string,
): Promise<void> {
  await message.delete().catch(() => undefined);
  if (pendingMessageId && pendingMessageId !== message.id) {
    await deleteClanThreadMessage(guild, channelId, pendingMessageId);
  }
}

/**
 * Notify users about a resolved clan request.
 * Uses #bot-notifications when configured; otherwise replies in the rules thread (legacy).
 */
export async function notifyClanRequestOutcome(
  guild: Guild,
  threadChannelId: string,
  sourceMessageId: string | undefined,
  content: string,
  mentionUserIds?: string[],
): Promise<void> {
  const mentions = mentionUserIds?.filter(Boolean) ?? [];
  const uniqueMentions = [...new Set(mentions)];

  if (DISCORD_CLAN_NOTIFICATIONS_CHANNEL_ID) {
    const channel = await guild.channels.fetch(DISCORD_CLAN_NOTIFICATIONS_CHANNEL_ID).catch(() => null);
    if (channel?.isTextBased()) {
      const prefix =
        uniqueMentions.length > 0 ? uniqueMentions.map((id) => `<@${id}>`).join(" ") + "\n" : "";
      await (channel as TextChannel)
        .send({
          content: (prefix + content).slice(0, 2000),
          allowedMentions: uniqueMentions.length > 0 ? { users: uniqueMentions } : { parse: [] },
        })
        .catch((err) => console.warn("Clan notifications channel send failed:", err));
      return;
    }
    console.warn(
      `[Clan] DISCORD_CLAN_NOTIFICATIONS_CHANNEL_ID=${DISCORD_CLAN_NOTIFICATIONS_CHANNEL_ID} is not a text channel.`,
    );
  }

  await replyToClanRequestMessage(guild, threadChannelId, sourceMessageId, content, uniqueMentions);
}

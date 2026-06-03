import { randomUUID } from "crypto";
import type {
  Guild,
  GuildTextBasedChannel,
  Message,
  MessageCreateOptions,
  ThreadChannel,
} from "discord.js";
import { DISCORD_CLAN_RULES_MESSAGE_ID } from "../../config";

export function newClanRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function validateClanName(name: string, minLen: number, maxLen: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return "length";
  if (/[@#]/.test(trimmed)) return "chars";
  if (/[\[\](){}]/.test(trimmed)) return "brackets";
  return null;
}

export function parseLeaderIdsFromMentions(content: string, memberIds: string[]): string[] {
  const leaders: string[] = [];
  for (const id of memberIds) {
    const re = new RegExp(`👑\\s*<@!?${id}>`);
    if (re.test(content)) leaders.push(id);
  }
  return leaders;
}

export async function isClanRulesThread(guild: Guild, thread: ThreadChannel): Promise<boolean> {
  const rulesMsgId = DISCORD_CLAN_RULES_MESSAGE_ID;
  if (!rulesMsgId || !thread.parentId) return false;
  const ch = await guild.channels.fetch(thread.parentId).catch(() => null);
  if (!ch?.isTextBased()) return false;
  const msg = await ch.messages.fetch(rulesMsgId).catch(() => null);
  return msg?.thread?.id === thread.id;
}

export function formatUserList(guild: Guild, userIds: string[], leaderIds: Set<string>): string {
  const lines: string[] = [];
  for (const id of userIds) {
    const member = guild.members.cache.get(id);
    const label = member ? member.toString() : `<@${id}>`;
    lines.push(leaderIds.has(id) ? `👑 ${label}` : label);
  }
  return lines.join("\n") || "—";
}

/** Reply to the user's original clan command message; falls back to channel send. */
export async function replyToClanRequestMessage(
  guild: Guild,
  channelId: string,
  sourceMessageId: string | undefined,
  content: string,
  mentionUserIds?: string[],
): Promise<void> {
  if (!sourceMessageId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const payload = {
    content: content.slice(0, 2000),
    allowedMentions:
      mentionUserIds && mentionUserIds.length > 0
        ? { users: mentionUserIds }
        : { parse: [] as const },
  };

  const source = await channel.messages.fetch(sourceMessageId).catch(() => null);
  if (source) {
    await source.reply(payload).catch(() => undefined);
    return;
  }
  await channel.send(payload).catch(() => undefined);
}

export async function ensureThreadReadyForSend(
  channel: GuildTextBasedChannel,
): Promise<GuildTextBasedChannel> {
  if (!channel.isThread()) return channel;

  let thread: ThreadChannel = channel;
  if (thread.archived) {
    await thread.setArchived(false).catch(() => undefined);
    const fresh = await thread.fetch().catch(() => null);
    if (fresh?.isThread()) thread = fresh;
  }
  if (thread.joinable && !thread.joined) {
    await thread.join().catch(() => undefined);
  }
  return thread as GuildTextBasedChannel;
}

function stripUndefinedSendOptions(options: MessageCreateOptions): MessageCreateOptions {
  const out = { ...options };
  if (out.content === undefined) delete out.content;
  if (out.allowedMentions === undefined) delete out.allowedMentions;
  return out;
}

/** Send approval/notification in rules thread; joins/unarchives thread and falls back to source reply. */
export async function sendInClanChannel(
  channel: GuildTextBasedChannel,
  options: MessageCreateOptions,
  sourceMessageId?: string,
): Promise<Message | null> {
  const ready = await ensureThreadReadyForSend(channel);
  const base = stripUndefinedSendOptions(options);

  const trySend = async (opts: MessageCreateOptions): Promise<Message | null> =>
    ready.send(opts).catch((err) => {
      console.warn("Clan channel send failed:", err);
      return null;
    });

  let msg = await trySend(base);
  if (msg) return msg;

  if (options.allowedMentions) {
    const { allowedMentions: _, ...withoutMentions } = base;
    msg = await trySend(stripUndefinedSendOptions(withoutMentions));
    if (msg) return msg;
  }

  if (sourceMessageId) {
    const source = await ready.messages.fetch(sourceMessageId).catch(() => null);
    if (source) {
      return source.reply(base).catch((err) => {
        console.warn("Clan source reply failed:", err);
        return null;
      });
    }
  }

  return null;
}

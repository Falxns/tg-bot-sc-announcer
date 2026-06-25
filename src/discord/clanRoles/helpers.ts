import { randomUUID } from "crypto";
import { ChannelType, type Guild, type GuildTextBasedChannel, type Message, type MessageCreateOptions, type ThreadChannel } from "discord.js";
import { DISCORD_CLAN_RULES_MESSAGE_ID } from "../../config";
import type { ClanTier } from "./constants";

const CLAN_TIER_INPUT_MAP: Record<string, ClanTier> = {
  S: "S",
  s: "S",
  A: "A",
  a: "A",
  А: "A",
  а: "A",
  B: "B",
  b: "B",
  Б: "B",
  б: "B",
  C: "C",
  c: "C",
  Ц: "C",
  ц: "C",
  С: "C",
  с: "C",
  D: "D",
  d: "D",
  Д: "D",
  д: "D",
  E: "E",
  e: "E",
  Е: "E",
  е: "E",
};

/** Parse a single-letter clan tier from !создать line 2. Returns null if unrecognized. */
export function parseClanTier(input: string): ClanTier | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length !== 1) return null;
  return CLAN_TIER_INPUT_MAP[trimmed] ?? null;
}

/** Roles are created only for D tier and higher. */
export function isClanTierEligibleForCreate(tier: ClanTier): boolean {
  return tier !== "E";
}

export function newClanRequestId(): string {
  return randomUUID().slice(0, 8);
}

const CLAN_NAME_TAG_BRACKETS_RE = /[\[\](){}]/;
const CLAN_NAME_TAG_FOUR_CAPS_RE = /(?:^|\s)(?:[A-Z]{4}|[А-ЯЁ]{4})(?:\s|$)/;

/** Brackets or 4-letter tag token — same markers as {@link validateClanName} «brackets» reason. */
export function hasClanTagInText(text: string): boolean {
  const trimmed = text.trim();
  return CLAN_NAME_TAG_BRACKETS_RE.test(trimmed) || CLAN_NAME_TAG_FOUR_CAPS_RE.test(trimmed);
}

export function validateClanName(name: string, minLen: number, maxLen: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return "length";
  if (/[@#]/.test(trimmed)) return "chars";
  if (hasClanTagInText(trimmed)) {
    return "brackets";
  }
  return null;
}

export function parseLeaderIdsFromMentions(content: string, memberIds: string[]): string[] {
  const leaders: string[] = [];
  for (const id of memberIds) {
    if (hasMarkerBeforeMention(content, "👑", id)) leaders.push(id);
  }
  return leaders;
}

export function parseRecruiterIdsFromMentions(content: string, memberIds: string[]): string[] {
  const recruiters: string[] = [];
  for (const id of memberIds) {
    if (hasMarkerBeforeMention(content, "⭐", id)) recruiters.push(id);
  }
  return recruiters;
}

/** Match marker immediately before a mention (optional spaces/tabs, same line). */
function hasMarkerBeforeMention(content: string, marker: string, userId: string): boolean {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mention = `<@!?${userId}>`;
  const re = new RegExp(`${escaped}[ \\t]*${mention}`);
  return re.test(content);
}

/** Mention snowflakes in left-to-right order (deduped). */
export function parseMentionIdsInOrder(content: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /<@!?(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export async function isClanRulesThread(guild: Guild, thread: ThreadChannel): Promise<boolean> {
  const rulesMsgId = DISCORD_CLAN_RULES_MESSAGE_ID;
  if (!rulesMsgId || !thread.parentId) return false;
  const ch = await guild.channels.fetch(thread.parentId).catch(() => null);
  if (!ch?.isTextBased()) return false;
  const msg = await ch.messages.fetch(rulesMsgId).catch(() => null);
  return msg?.thread?.id === thread.id;
}

/** Locate the configured clan rules command thread (active or archived). */
export async function resolveClanRulesThread(guild: Guild): Promise<ThreadChannel | null> {
  if (!DISCORD_CLAN_RULES_MESSAGE_ID) return null;

  const active = await guild.channels.fetchActiveThreads().catch(() => null);
  if (active) {
    for (const thread of active.threads.values()) {
      if (await isClanRulesThread(guild, thread)) return thread;
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      continue;
    }
    const textChannel = channel as GuildTextBasedChannel;
    const msg = await textChannel.messages.fetch(DISCORD_CLAN_RULES_MESSAGE_ID).catch(() => null);
    const thread = msg?.thread;
    if (thread && (await isClanRulesThread(guild, thread))) {
      return thread;
    }
  }

  return null;
}

export function formatUserList(
  guild: Guild,
  userIds: string[],
  leaderIds: Set<string>,
  recruiterIds: Set<string> = new Set(),
): string {
  const lines: string[] = [];
  for (const id of userIds) {
    const member = guild.members.cache.get(id);
    const label = member ? member.toString() : `<@${id}>`;
    if (leaderIds.has(id)) {
      lines.push(`👑 ${label}`);
    } else if (recruiterIds.has(id)) {
      lines.push(`⭐ ${label}`);
    } else {
      lines.push(label);
    }
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

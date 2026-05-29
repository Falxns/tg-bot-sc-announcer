import { randomUUID } from "crypto";
import type { Guild, ThreadChannel } from "discord.js";
import { DISCORD_CLAN_RULES_MESSAGE_ID } from "../../config";

export function newClanRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function validateClanName(name: string, minLen: number, maxLen: number): string | null {
  const trimmed = name.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return "length";
  if (/[@#]/.test(trimmed)) return "chars";
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

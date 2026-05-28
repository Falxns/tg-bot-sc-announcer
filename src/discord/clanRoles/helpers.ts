import { randomUUID } from "crypto";
import type { Guild, PrivateThreadChannel, TextChannel, ThreadChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { DISCORD_CLAN_RULES_MESSAGE_ID, DISCORD_MODERATOR_ROLE_IDS } from "../../config";
import type { ClanRulesPanelState } from "../types";

export function newClanRequestId(): string {
  return randomUUID().slice(0, 8);
}

/** Adds guild members with moderator roles to a private clan-create thread. */
export async function addClanModeratorsToPrivateThread(
  guild: Guild,
  thread: PrivateThreadChannel,
  excludeUserId?: string,
): Promise<void> {
  const roleIds = DISCORD_MODERATOR_ROLE_IDS;
  if (roleIds.length === 0) return;

  const userIds = new Set<string>();
  for (const roleId of roleIds) {
    const role =
      guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) continue;
    for (const [, member] of role.members) {
      if (member.user.bot) continue;
      if (excludeUserId && member.id === excludeUserId) continue;
      userIds.add(member.id);
    }
  }

  await Promise.all([...userIds].map((id) => thread.members.add(id).catch(() => undefined)));
}

export async function resolveClanRequestsThread(
  guild: Guild,
  panel: ClanRulesPanelState,
): Promise<ThreadChannel | TextChannel | null> {
  const parentId = panel.rulesParentMessageId || DISCORD_CLAN_RULES_MESSAGE_ID;
  if (parentId) {
    const parentChannel = panel.channelId
      ? await guild.channels.fetch(panel.channelId).catch(() => null)
      : null;
    if (parentChannel?.isTextBased()) {
      const msg = await parentChannel.messages.fetch(parentId).catch(() => null);
      if (msg?.thread) return msg.thread;
      if (msg && parentChannel.type === ChannelType.GuildText) {
        const thread = await msg
          .startThread({
            name: "Запросы ролей клана",
            autoArchiveDuration: 10080,
            reason: "Clan role requests",
          })
          .catch(() => null);
        if (thread) return thread;
      }
    }
  }
  const ch = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (ch && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)) {
    return ch as TextChannel;
  }
  return null;
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

export function formatUserList(guild: Guild, userIds: string[], leaderIds: Set<string>): string {
  const lines: string[] = [];
  for (const id of userIds) {
    const member = guild.members.cache.get(id);
    const label = member ? member.toString() : `<@${id}>`;
    lines.push(leaderIds.has(id) ? `👑 ${label}` : label);
  }
  return lines.join("\n") || "—";
}

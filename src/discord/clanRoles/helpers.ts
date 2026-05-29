import { randomUUID } from "crypto";
import type { Guild, TextChannel, ThreadChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { DISCORD_CLAN_RULES_MESSAGE_ID } from "../../config";
import { clanRulesPanels } from "../../state";
import type { ClanRulesPanelState } from "../types";

export function newClanRequestId(): string {
  return randomUUID().slice(0, 8);
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

export function getClanRulesPanelForGuild(guildId: string): ClanRulesPanelState | undefined {
  for (const panel of clanRulesPanels.values()) {
    if (panel.guildId === guildId) return panel;
  }
  return undefined;
}

export function buildFallbackClanPanel(guildId: string, channelId: string): ClanRulesPanelState {
  return {
    messageId: "",
    guildId,
    channelId,
    rulesParentMessageId: DISCORD_CLAN_RULES_MESSAGE_ID || undefined,
  };
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

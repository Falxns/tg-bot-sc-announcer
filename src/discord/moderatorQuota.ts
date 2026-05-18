import {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS, DISCORD_MODERATION_DAILY_QUOTA } from "../config";
import { getModeratorDailyQuotaUsed, recordModeratorDailyQuotaUse as incrementModeratorDailyQuota } from "../state";
import { discordModerationCommands as modTxt } from "./userStrings";

function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
  if (!member) return [];
  if (member instanceof GuildMember) return [...member.roles.cache.keys()];
  if (Array.isArray(member.roles)) return member.roles;
  return [];
}

/** Same role list as elevated /post access — bypasses daily punitive quota. */
export function isModeratorQuotaExempt(member: GuildMember | APIInteractionGuildMember | null): boolean {
  const allowed = DISCORD_ADMIN_ROLE_IDS;
  if (allowed.length === 0) return false;
  return memberRoleIds(member).some((id) => allowed.includes(id));
}

export function getModeratorQuotaStatus(
  guildId: string,
  staffUserId: string,
  nowMs = Date.now(),
): { used: number; limit: number; remaining: number } {
  const limit = DISCORD_MODERATION_DAILY_QUOTA;
  const used = getModeratorDailyQuotaUsed(guildId, staffUserId, nowMs);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Blocks punitive slash when daily quota is exhausted.
 * @returns true if the command may proceed
 */
export async function assertModeratorQuota(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const limit = DISCORD_MODERATION_DAILY_QUOTA;
  if (limit <= 0) return true;
  if (isModeratorQuotaExempt(interaction.member)) return true;
  const guildId = interaction.guildId;
  if (!guildId) return true;

  const { used } = getModeratorQuotaStatus(guildId, interaction.user.id);
  if (used < limit) return true;

  await interaction.reply({
    content: modTxt.moderatorQuotaExceeded(used, limit),
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

export function recordModeratorQuotaUse(guildId: string, staffUserId: string): void {
  if (DISCORD_MODERATION_DAILY_QUOTA <= 0) return;
  incrementModeratorDailyQuota(guildId, staffUserId, Date.now());
}

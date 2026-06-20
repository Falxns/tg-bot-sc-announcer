import {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS, DISCORD_MODERATION_DAILY_QUOTA } from "../config";
import { isDiscordAdmin } from "./guildPermissions";
import { getModeratorDailyQuotaUsed, recordModeratorDailyQuotaUse as incrementModeratorDailyQuota } from "../state";
import { discordModerationCommands as modTxt } from "./userStrings";

/** Admin roles bypass daily punitive quota; line moderators do not. */
export function isModeratorQuotaExempt(member: GuildMember | APIInteractionGuildMember | null): boolean {
  if (DISCORD_ADMIN_ROLE_IDS.length === 0) return false;
  return isDiscordAdmin(member);
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

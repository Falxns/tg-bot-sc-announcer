import {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  type InteractionReplyOptions,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
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

type QuotaGateInteraction = (MessageComponentInteraction | ModalSubmitInteraction) & {
  guildId: string | null;
  user: { id: string };
  member: GuildMember | APIInteractionGuildMember | null;
  reply: (options: InteractionReplyOptions) => Promise<unknown>;
  followUp: (options: InteractionReplyOptions) => Promise<unknown>;
  replied: boolean;
  deferred: boolean;
};

/** Blocks clan-review buttons when daily punitive quota is exhausted. */
export async function assertModeratorQuotaInteraction(interaction: QuotaGateInteraction): Promise<boolean> {
  const limit = DISCORD_MODERATION_DAILY_QUOTA;
  if (limit <= 0) return true;
  if (isModeratorQuotaExempt(interaction.member)) return true;
  const guildId = interaction.guildId;
  if (!guildId) return true;

  const { used } = getModeratorQuotaStatus(guildId, interaction.user.id);
  if (used < limit) return true;

  const payload: InteractionReplyOptions = {
    content: modTxt.moderatorQuotaExceeded(used, limit),
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => undefined);
  } else {
    await interaction.reply(payload).catch(() => undefined);
  }
  return false;
}

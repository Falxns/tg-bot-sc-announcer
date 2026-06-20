import {
  APIInteractionGuildMember,
  GuildMember,
  MessageFlags,
  type InteractionReplyOptions,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { DISCORD_CLAN_REVIEW_DAILY_QUOTA } from "../config";
import { getClanReviewDailyQuotaUsed, recordClanReviewDailyQuotaUse as incrementClanReviewDailyQuota } from "../state";
import { isModeratorQuotaExempt } from "./moderatorQuota";
import { discordModerationCommands as modTxt } from "./userStrings";

export function getClanReviewQuotaStatus(
  guildId: string,
  staffUserId: string,
  nowMs = Date.now(),
): { used: number; limit: number; remaining: number } {
  const limit = DISCORD_CLAN_REVIEW_DAILY_QUOTA;
  const used = getClanReviewDailyQuotaUsed(guildId, staffUserId, nowMs);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export function recordClanReviewQuotaUse(guildId: string, staffUserId: string): void {
  if (DISCORD_CLAN_REVIEW_DAILY_QUOTA <= 0) return;
  incrementClanReviewDailyQuota(guildId, staffUserId, Date.now());
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

/** Blocks clan create review buttons when daily review quota is exhausted. */
export async function assertClanReviewQuotaInteraction(interaction: QuotaGateInteraction): Promise<boolean> {
  const limit = DISCORD_CLAN_REVIEW_DAILY_QUOTA;
  if (limit <= 0) return true;
  if (isModeratorQuotaExempt(interaction.member)) return true;
  const guildId = interaction.guildId;
  if (!guildId) return true;

  const { used } = getClanReviewQuotaStatus(guildId, interaction.user.id);
  if (used < limit) return true;

  const payload: InteractionReplyOptions = {
    content: modTxt.clanReviewQuotaExceeded(used, limit),
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => undefined);
  } else {
    await interaction.reply(payload).catch(() => undefined);
  }
  return false;
}

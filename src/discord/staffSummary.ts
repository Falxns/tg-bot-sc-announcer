import { AuditLogEvent, GuildMember, type Message, type Role } from "discord.js";
import {
  DISCORD_GUILD_ID,
  DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID,
  DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS,
  DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS,
  DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS,
  DISCORD_STAFF_SUMMARY_ROLE_CREATE_AUDIT_DELAY_MS,
  DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
} from "../config";
import { saveState, tryConsumeCreatorSummaryCooldown } from "../state";
import { postStaffSummaryLine } from "./moderationLog";
import { discordStaffModerationSummary as staffSumTxt } from "./userStrings";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasAnyRole(member: GuildMember, roleIds: readonly string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

const creatorChannelSet = () => new Set(DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS);

export async function handleStaffSummaryRoleCreate(role: Role): Promise<void> {
  if (!DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID) return;
  if (DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS.length === 0) return;
  if (role.guild.id !== DISCORD_GUILD_ID) return;
  if (role.managed) return;

  await sleep(DISCORD_STAFF_SUMMARY_ROLE_CREATE_AUDIT_DELAY_MS);

  let executorId: string | undefined;
  try {
    const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 6 });
    const entry = logs.entries.find((e) => e.targetId === role.id);
    if (entry?.executor && !entry.executor.bot) {
      executorId = entry.executor.id;
    }
  } catch (err) {
    console.error("Staff summary roleCreate audit log fetch failed:", err);
    return;
  }

  if (!executorId) return;

  const member = await role.guild.members.fetch(executorId).catch(() => null);
  if (!member || !hasAnyRole(member, DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS)) return;

  const roleName = role.name.trim() || role.id;
  await postStaffSummaryLine(role.guild, staffSumTxt.lineRoleCreate(executorId, roleName));

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`[Staff summary] roleCreate by ${executorId}: ${roleName} (${role.id})`);
  }
}

export async function handleStaffSummaryCreatorMessage(message: Message): Promise<void> {
  if (!DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID) return;
  if (DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS.length === 0) return;
  if (DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS.length === 0) return;
  if (!message.inGuild()) return;
  if (message.guildId !== DISCORD_GUILD_ID) return;
  if (message.author.bot || message.system) return;

  const ch = message.channel;
  if (ch.isDMBased() || ch.isThread()) return;
  if (!creatorChannelSet().has(message.channelId)) return;

  const member =
    message.member instanceof GuildMember
      ? message.member
      : await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !hasAnyRole(member, DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS)) return;

  const now = Date.now();
  if (
    !tryConsumeCreatorSummaryCooldown(
      message.guildId,
      message.author.id,
      message.channelId,
      now,
      DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS,
    )
  ) {
    return;
  }

  const url = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
  await postStaffSummaryLine(
    message.guild,
    staffSumTxt.lineCreatorPost(message.author.id, message.channelId, url),
  );
  void saveState(LAST_SEEN_STATE_FILE);

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `[Staff summary] creator post ${message.author.id} in ${message.channelId} msg=${message.id}`,
    );
  }
}

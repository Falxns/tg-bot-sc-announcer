import {
  AuditLogEvent,
  GuildMember,
  type Guild,
  type Message,
  type PartialGuildMember,
  type Role,
} from "discord.js";
import {
  DISCORD_GUILD_ID,
  DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID,
  DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS,
  DISCORD_STAFF_SUMMARY_CREATOR_COOLDOWN_MS,
  DISCORD_STAFF_SUMMARY_CREATOR_ROLE_IDS,
  DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS,
  DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
} from "../config";
import { saveState, tryConsumeCreatorSummaryCooldown } from "../state";
import { postStaffSummaryLine } from "./moderationLog";
import { discordStaffModerationSummary as staffSumTxt } from "./userStrings";

const MEMBER_ROLE_AUDIT_MAX_AGE_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasAnyRole(member: GuildMember, roleIds: readonly string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function staffSummaryRoleTrackingEnabled(): boolean {
  return (
    DISCORD_MODERATION_STAFF_SUMMARY_CHANNEL_ID.length > 0 &&
    DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS.length > 0
  );
}

async function isTrackedStaffExecutor(guild: Guild, executorId: string): Promise<boolean> {
  if (executorId === guild.client.user?.id) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  return member !== null && hasAnyRole(member, DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS);
}

function roleIdFromAuditChangeValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: string }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

type RoleChangeAction = "add" | "remove";

async function resolveMemberRoleChangeExecutor(
  guild: Guild,
  targetUserId: string,
  roleId: string,
  action: RoleChangeAction,
): Promise<string | undefined> {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 12 });
    const now = Date.now();
    for (const entry of logs.entries.values()) {
      if (entry.targetId !== targetUserId) continue;
      if (now - entry.createdTimestamp > MEMBER_ROLE_AUDIT_MAX_AGE_MS) continue;
      if (!entry.executor || entry.executor.bot) continue;
      for (const change of entry.changes) {
        if (action === "add" && change.key === "$add") {
          if (roleIdFromAuditChangeValue(change.new) === roleId) return entry.executor.id;
        }
        if (action === "remove" && change.key === "$remove") {
          if (roleIdFromAuditChangeValue(change.old) === roleId) return entry.executor.id;
        }
      }
    }
  } catch (err) {
    console.error("Staff summary member role audit log fetch failed:", err);
  }
  return undefined;
}

function diffMemberRoles(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): { added: string[]; removed: string[] } {
  const everyone = newMember.guild.id;
  const oldIds = new Set(oldMember.roles.cache.keys());
  const newIds = new Set(newMember.roles.cache.keys());
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of newIds) {
    if (id === everyone || oldIds.has(id)) continue;
    added.push(id);
  }
  for (const id of oldIds) {
    if (id === everyone || newIds.has(id)) continue;
    removed.push(id);
  }
  return { added, removed };
}

const creatorChannelSet = () => new Set(DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS);

export async function handleStaffSummaryRoleCreate(role: Role): Promise<void> {
  if (!staffSummaryRoleTrackingEnabled()) return;
  if (role.guild.id !== DISCORD_GUILD_ID) return;
  if (role.managed) return;

  await sleep(DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS);

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
  if (!(await isTrackedStaffExecutor(role.guild, executorId))) return;

  const roleName = role.name.trim() || role.id;
  await postStaffSummaryLine(role.guild, staffSumTxt.lineRoleCreate(executorId, roleName));

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`[Staff summary] roleCreate by ${executorId}: ${roleName} (${role.id})`);
  }
}

export async function handleStaffSummaryMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (!staffSummaryRoleTrackingEnabled()) return;
  if (newMember.guild.id !== DISCORD_GUILD_ID) return;
  if (newMember.user.bot) return;

  const { added, removed } = diffMemberRoles(oldMember, newMember);
  if (added.length === 0 && removed.length === 0) return;

  await sleep(DISCORD_STAFF_SUMMARY_ROLE_AUDIT_DELAY_MS);

  const guild = newMember.guild;
  const targetUserId = newMember.id;

  for (const roleId of added) {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role || role.managed) continue;

    const executorId = await resolveMemberRoleChangeExecutor(guild, targetUserId, roleId, "add");
    if (!executorId || !(await isTrackedStaffExecutor(guild, executorId))) continue;

    const roleName = role.name.trim() || role.id;
    await postStaffSummaryLine(guild, staffSumTxt.lineRoleAssign(executorId, targetUserId, roleName));

    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log(`[Staff summary] roleAssign ${executorId} → ${targetUserId}: ${roleName}`);
    }
  }

  for (const roleId of removed) {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role || role.managed) continue;

    const executorId = await resolveMemberRoleChangeExecutor(guild, targetUserId, roleId, "remove");
    if (!executorId || !(await isTrackedStaffExecutor(guild, executorId))) continue;

    const roleName = role.name.trim() || role.id;
    await postStaffSummaryLine(guild, staffSumTxt.lineRoleRemove(executorId, targetUserId, roleName));

    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log(`[Staff summary] roleRemove ${executorId} → ${targetUserId}: ${roleName}`);
    }
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

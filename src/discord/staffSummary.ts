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
  DISCORD_STAFF_SUMMARY_ROLE_CHANGE_BATCH_MS,
  DISCORD_STAFF_SUMMARY_ROLE_CREATE_NAME_WAIT_MS,
  DISCORD_STAFF_SUMMARY_ROLE_CREATE_TRACKED_ROLE_IDS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
} from "../config";
import { saveState, tryConsumeCreatorSummaryCooldown } from "../state";
import { editStaffSummaryLine, postStaffSummaryLine } from "./moderationLog";
import { discordStaffModerationSummary as staffSumTxt } from "./userStrings";

const MEMBER_ROLE_AUDIT_MAX_AGE_MS = 15_000;

const PLACEHOLDER_ROLE_NAMES = new Set(["new role", "новая роль"]);

type RoleChangeKind = "assign" | "remove";

type RoleChangeBatch = {
  messageId: string;
  firstTargetUserId: string;
  roleName: string;
  extraCount: number;
  flushTimer: ReturnType<typeof setTimeout>;
};

type PendingRoleCreate = {
  guildId: string;
  executorId: string | null;
  createdAt: number;
  posted: boolean;
  timeout: ReturnType<typeof setTimeout>;
};

const roleChangeBatches = new Map<string, RoleChangeBatch>();
const pendingRoleCreates = new Map<string, PendingRoleCreate>();

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

function isPlaceholderRoleName(name: string): boolean {
  return PLACEHOLDER_ROLE_NAMES.has(name.trim().toLowerCase());
}

function roleChangeBatchKey(
  guildId: string,
  kind: RoleChangeKind,
  executorId: string,
  roleId: string,
): string {
  return `${guildId}:${kind}:${executorId}:${roleId}`;
}

function clearRoleChangeBatch(key: string): void {
  const batch = roleChangeBatches.get(key);
  if (!batch) return;
  clearTimeout(batch.flushTimer);
  roleChangeBatches.delete(key);
}

function scheduleRoleChangeBatchExpiry(key: string): ReturnType<typeof setTimeout> {
  return setTimeout(() => clearRoleChangeBatch(key), DISCORD_STAFF_SUMMARY_ROLE_CHANGE_BATCH_MS);
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

function roleIdsFromAuditChangeValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    const ids: string[] = [];
    for (const item of value) {
      const id = roleIdFromAuditChangeValue(item);
      if (id) ids.push(id);
    }
    return ids;
  }
  const single = roleIdFromAuditChangeValue(value);
  return single ? [single] : [];
}

function auditEntryIncludesRoleChange(
  entry: { changes: readonly { key: string; old?: unknown; new?: unknown }[] },
  roleId: string,
  action: RoleChangeKind,
): boolean {
  const changeKey = action === "assign" ? "$add" : "$remove";
  const valueKey = action === "assign" ? "new" : "old";
  for (const change of entry.changes) {
    if (change.key !== changeKey) continue;
    const raw = valueKey === "new" ? change.new : change.old;
    if (roleIdsFromAuditChangeValue(raw).includes(roleId)) return true;
  }
  return false;
}

async function resolveMemberRoleChangeExecutor(
  guild: Guild,
  targetUserId: string,
  roleId: string,
  action: RoleChangeKind,
): Promise<string | undefined> {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 12 });
    const now = Date.now();
    for (const entry of logs.entries.values()) {
      if (entry.targetId !== targetUserId) continue;
      if (now - entry.createdTimestamp > MEMBER_ROLE_AUDIT_MAX_AGE_MS) continue;
      if (!entry.executor || entry.executor.bot) continue;
      if (auditEntryIncludesRoleChange(entry, roleId, action)) return entry.executor.id;
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

function clearPendingRoleCreate(roleId: string): void {
  const pending = pendingRoleCreates.get(roleId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingRoleCreates.delete(roleId);
}

async function postRoleCreateDigest(guild: Guild, roleId: string, force: boolean): Promise<void> {
  const pending = pendingRoleCreates.get(roleId);
  if (!pending || pending.posted) return;
  if (pending.guildId !== guild.id) return;
  if (!pending.executorId) return;

  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    clearPendingRoleCreate(roleId);
    return;
  }

  const roleName = role.name.trim() || role.id;
  if (!force && isPlaceholderRoleName(roleName) && Date.now() - pending.createdAt < DISCORD_STAFF_SUMMARY_ROLE_CREATE_NAME_WAIT_MS) {
    return;
  }

  pending.posted = true;
  clearPendingRoleCreate(roleId);

  await postStaffSummaryLine(guild, staffSumTxt.lineRoleCreate(pending.executorId, roleName));

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`[Staff summary] roleCreate by ${pending.executorId}: ${roleName} (${role.id})`);
  }
}

function registerPendingRoleCreate(guild: Guild, roleId: string): void {
  clearPendingRoleCreate(roleId);
  const createdAt = Date.now();
  const timeout = setTimeout(() => {
    void postRoleCreateDigest(guild, roleId, true).catch((err) => {
      console.error("Staff summary roleCreate timeout post failed:", err);
    });
  }, DISCORD_STAFF_SUMMARY_ROLE_CREATE_NAME_WAIT_MS);

  pendingRoleCreates.set(roleId, {
    guildId: guild.id,
    executorId: null,
    createdAt,
    posted: false,
    timeout,
  });
}

async function postOrBumpRoleChangeBatch(
  guild: Guild,
  kind: RoleChangeKind,
  executorId: string,
  roleId: string,
  roleName: string,
  targetUserId: string,
): Promise<void> {
  const key = roleChangeBatchKey(guild.id, kind, executorId, roleId);
  const existing = roleChangeBatches.get(key);

  if (existing) {
    existing.extraCount += 1;
    clearTimeout(existing.flushTimer);
    existing.flushTimer = scheduleRoleChangeBatchExpiry(key);
    const content =
      kind === "assign"
        ? staffSumTxt.lineRoleAssignBatch(executorId, roleName, existing.firstTargetUserId, existing.extraCount)
        : staffSumTxt.lineRoleRemoveBatch(executorId, roleName, existing.firstTargetUserId, existing.extraCount);
    await editStaffSummaryLine(guild, existing.messageId, content);
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log(`[Staff summary] role${kind} batch ${executorId} ${roleName} (+${existing.extraCount})`);
    }
    return;
  }

  const content =
    kind === "assign"
      ? staffSumTxt.lineRoleAssign(executorId, targetUserId, roleName)
      : staffSumTxt.lineRoleRemove(executorId, targetUserId, roleName);
  const message = await postStaffSummaryLine(guild, content);
  if (!message) return;

  roleChangeBatches.set(key, {
    messageId: message.id,
    firstTargetUserId: targetUserId,
    roleName,
    extraCount: 0,
    flushTimer: scheduleRoleChangeBatchExpiry(key),
  });

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(`[Staff summary] role${kind} ${executorId} → ${targetUserId}: ${roleName}`);
  }
}

const creatorChannelSet = () => new Set(DISCORD_STAFF_SUMMARY_CREATOR_CHANNEL_IDS);

export async function handleStaffSummaryRoleCreate(role: Role): Promise<void> {
  if (!staffSummaryRoleTrackingEnabled()) return;
  if (role.guild.id !== DISCORD_GUILD_ID) return;
  if (role.managed) return;

  registerPendingRoleCreate(role.guild, role.id);

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

  const pending = pendingRoleCreates.get(role.id);
  if (!executorId || !pending) {
    clearPendingRoleCreate(role.id);
    return;
  }
  if (!(await isTrackedStaffExecutor(role.guild, executorId))) {
    clearPendingRoleCreate(role.id);
    return;
  }

  pending.executorId = executorId;
  await postRoleCreateDigest(role.guild, role.id, false);
}

export async function handleStaffSummaryRoleUpdate(role: Role, oldRole: Role): Promise<void> {
  if (!staffSummaryRoleTrackingEnabled()) return;
  if (role.guild.id !== DISCORD_GUILD_ID) return;
  if (role.managed) return;
  if (oldRole.name === role.name) return;

  const pending = pendingRoleCreates.get(role.id);
  if (!pending || pending.posted) return;

  await postRoleCreateDigest(role.guild, role.id, false);
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

    const executorId = await resolveMemberRoleChangeExecutor(guild, targetUserId, roleId, "assign");
    if (!executorId || !(await isTrackedStaffExecutor(guild, executorId))) continue;

    const roleName = role.name.trim() || role.id;
    await postOrBumpRoleChangeBatch(guild, "assign", executorId, roleId, roleName, targetUserId);
  }

  for (const roleId of removed) {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role || role.managed) continue;

    const executorId = await resolveMemberRoleChangeExecutor(guild, targetUserId, roleId, "remove");
    if (!executorId || !(await isTrackedStaffExecutor(guild, executorId))) continue;

    const roleName = role.name.trim() || role.id;
    await postOrBumpRoleChangeBatch(guild, "remove", executorId, roleId, roleName, targetUserId);
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

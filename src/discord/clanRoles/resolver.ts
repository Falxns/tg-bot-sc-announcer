import type { Guild, GuildMember, Role } from "discord.js";
import {
  DISCORD_CLAN_LEADER_ROLE_ID,
  DISCORD_CLAN_ROLE_EXCLUDE_IDS,
  DISCORD_CLAN_ROLE_NAME_PATTERN,
} from "../../config";

function isExcludedClanRole(role: Role, guild: Guild): boolean {
  if (role.managed) return true;
  if (role.id === guild.id) return true;
  if (DISCORD_CLAN_ROLE_EXCLUDE_IDS.includes(role.id)) return true;
  if (DISCORD_CLAN_LEADER_ROLE_ID && role.id === DISCORD_CLAN_LEADER_ROLE_ID) return true;
  if (DISCORD_CLAN_ROLE_NAME_PATTERN && !DISCORD_CLAN_ROLE_NAME_PATTERN.test(role.name)) return true;
  return false;
}

export function listClanRoles(guild: Guild): Role[] {
  return [...guild.roles.cache.values()]
    .filter((r) => !isExcludedClanRole(r, guild))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function listMemberClanRoles(guild: Guild, member: GuildMember): Role[] {
  return listClanRoles(guild).filter((role) => member.roles.cache.has(role.id));
}

/** Load full member list when cache is incomplete (Role#members is cache-only in discord.js). */
export async function ensureGuildMembersCached(guild: Guild): Promise<void> {
  if (guild.memberCount <= guild.members.cache.size) return;
  await guild.members.fetch().catch(() => undefined);
}

export function countMembersWithRole(guild: Guild, roleId: string): number {
  let n = 0;
  for (const [, member] of guild.members.cache) {
    if (member.roles.cache.has(roleId)) n++;
  }
  return n;
}

export function listMemberIdsWithRole(guild: Guild, roleId: string): string[] {
  const ids: string[] = [];
  for (const [, member] of guild.members.cache) {
    if (member.roles.cache.has(roleId)) ids.push(member.id);
  }
  return ids;
}

export function resolveClanRole(guild: Guild, query: string): Role[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = listClanRoles(guild);
  const exact = all.filter((r) => r.name.toLowerCase() === q);
  if (exact.length > 0) return exact;
  return all.filter((r) => r.name.toLowerCase().includes(q));
}

export function isClanLeaderFor(member: GuildMember, clanRoleId: string): boolean {
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return false;
  return member.roles.cache.has(clanRoleId) && member.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID);
}

/** Load guild members when a role's member list may be incomplete (cache-only in discord.js). */
export async function ensureRoleMembersCached(guild: Guild, roleId: string): Promise<Role | null> {
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return null;
  if (role.members.size === 0 && guild.memberCount > 0) {
    await guild.members.fetch().catch(() => undefined);
  }
  return guild.roles.cache.get(roleId) ?? role;
}

export async function listClanLeaderIds(guild: Guild, clanRoleId: string): Promise<string[]> {
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return [];
  await ensureGuildMembersCached(guild);
  const ids: string[] = [];
  for (const [, member] of guild.members.cache) {
    if (isClanLeaderFor(member, clanRoleId)) ids.push(member.id);
  }
  return ids;
}

export async function countClanLeaders(guild: Guild, clanRoleId: string): Promise<number> {
  return (await listClanLeaderIds(guild, clanRoleId)).length;
}

/** True if member is leader (meta-role) of at least one clan they still belong to. */
export function memberLeadsAnyClan(guild: Guild, member: GuildMember): boolean {
  if (!DISCORD_CLAN_LEADER_ROLE_ID || !member.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) return false;
  return listMemberClanRoles(guild, member).some((role) => isClanLeaderFor(member, role.id));
}

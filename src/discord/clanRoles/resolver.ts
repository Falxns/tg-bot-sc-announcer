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

export function countClanLeaders(guild: Guild, clanRoleId: string): number {
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return 0;
  const clanRole = guild.roles.cache.get(clanRoleId);
  if (!clanRole) return 0;
  let n = 0;
  for (const [, member] of clanRole.members) {
    if (member.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) n++;
  }
  return n;
}

/** True if member holds leader meta-role alongside any discovered clan role. */
export function memberLeadsAnyClan(guild: Guild, member: GuildMember): boolean {
  if (!DISCORD_CLAN_LEADER_ROLE_ID || !member.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) return false;
  const clanRoleIds = new Set(listClanRoles(guild).map((r) => r.id));
  return member.roles.cache.some((r) => clanRoleIds.has(r.id));
}

import type { Guild, GuildMember, Role } from "discord.js";
import {
  DISCORD_CLAN_LEADER_ROLE_ID,
  DISCORD_CLAN_RECRUITER_ROLE_ID,
} from "../../config";
import {
  countClanLeaders,
  countClanRecruiters,
  ensureGuildMembersCached,
  isClanLeaderFor,
  isClanRecruiterFor,
  listClanRoles,
  listMemberClanRoles,
} from "./resolver";
import { MAX_CLAN_LEADERS, MAX_CLAN_RECRUITERS } from "./constants";

export async function findLeadersWithoutClanRole(guild: Guild): Promise<GuildMember[]> {
  if (!DISCORD_CLAN_LEADER_ROLE_ID) return [];
  await ensureGuildMembersCached(guild);
  const out: GuildMember[] = [];
  for (const [, member] of guild.members.cache) {
    if (!member.roles.cache.has(DISCORD_CLAN_LEADER_ROLE_ID)) continue;
    if (listMemberClanRoles(guild, member).length === 0) {
      out.push(member);
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
}

export async function findRecruitersWithoutClanRole(guild: Guild): Promise<GuildMember[]> {
  if (!DISCORD_CLAN_RECRUITER_ROLE_ID) return [];
  await ensureGuildMembersCached(guild);
  const out: GuildMember[] = [];
  for (const [, member] of guild.members.cache) {
    if (!member.roles.cache.has(DISCORD_CLAN_RECRUITER_ROLE_ID)) continue;
    if (listMemberClanRoles(guild, member).length === 0) {
      out.push(member);
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
}

export async function findMembersWithMultipleClanRoles(guild: Guild): Promise<GuildMember[]> {
  await ensureGuildMembersCached(guild);
  const out: GuildMember[] = [];
  for (const [, member] of guild.members.cache) {
    if (listMemberClanRoles(guild, member).length >= 2) {
      out.push(member);
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
}

export async function findClanRolesWithExcessLeaders(
  guild: Guild,
): Promise<Array<{ role: Role; count: number }>> {
  await ensureGuildMembersCached(guild);
  const out: Array<{ role: Role; count: number }> = [];
  for (const role of listClanRoles(guild)) {
    const count = await countClanLeaders(guild, role.id);
    if (count > MAX_CLAN_LEADERS) {
      out.push({ role, count });
    }
  }
  return out;
}

export async function findClanRolesWithExcessRecruiters(
  guild: Guild,
): Promise<Array<{ role: Role; count: number }>> {
  await ensureGuildMembersCached(guild);
  const out: Array<{ role: Role; count: number }> = [];
  for (const role of listClanRoles(guild)) {
    const count = await countClanRecruiters(guild, role.id);
    if (count > MAX_CLAN_RECRUITERS) {
      out.push({ role, count });
    }
  }
  return out;
}

export async function findLeaderRecruiterOverlap(
  guild: Guild,
): Promise<Array<{ member: GuildMember; role: Role }>> {
  await ensureGuildMembersCached(guild);
  const out: Array<{ member: GuildMember; role: Role }> = [];
  for (const [, member] of guild.members.cache) {
    for (const role of listMemberClanRoles(guild, member)) {
      if (isClanLeaderFor(member, role.id) && isClanRecruiterFor(member, role.id)) {
        out.push({ member, role });
      }
    }
  }
  return out.sort((a, b) =>
    a.member.displayName.localeCompare(b.member.displayName, "ru"),
  );
}

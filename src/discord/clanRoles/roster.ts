import { EmbedBuilder, type Guild, type GuildMember, type Role } from "discord.js";
import { formatUserList } from "./helpers";
import { isClanModerator } from "./permissions";
import {
  ensureGuildMembersCached,
  isClanStaffFor,
  listClanLeaderIds,
  listClanRecruiterIds,
  listMemberIdsWithRole,
} from "./resolver";
import { clanTxt } from "./strings";

function sortRosterMemberIds(
  guild: Guild,
  memberIds: string[],
  leaderIds: Set<string>,
  recruiterIds: Set<string>,
): string[] {
  return [...memberIds].sort((a, b) => {
    const aLead = leaderIds.has(a);
    const bLead = leaderIds.has(b);
    if (aLead !== bLead) return aLead ? -1 : 1;
    const aRec = recruiterIds.has(a);
    const bRec = recruiterIds.has(b);
    if (aRec !== bRec) return aRec ? -1 : 1;
    const ma = guild.members.cache.get(a);
    const mb = guild.members.cache.get(b);
    return (ma?.displayName ?? a).localeCompare(mb?.displayName ?? b, "ru");
  });
}

function buildClanRosterEmbed(
  guild: Guild,
  clanRole: Role,
  memberIds: string[],
  leaderIds: string[],
  recruiterIds: string[],
): EmbedBuilder {
  const leaderSet = new Set(leaderIds);
  const recruiterSet = new Set(recruiterIds);
  const sorted = sortRosterMemberIds(guild, memberIds, leaderSet, recruiterSet);
  const body = formatUserList(guild, sorted, leaderSet, recruiterSet);

  return new EmbedBuilder()
    .setColor(clanRole.color || 0x5865f2)
    .setTitle(clanTxt.rosterDmTitle(clanRole.name))
    .setDescription(
      `${clanTxt.rosterDmCount(memberIds.length, leaderIds.length, recruiterIds.length)}\n\n${body}`.slice(
        0,
        4096,
      ),
    )
    .setFooter({ text: clanTxt.rosterDmFooter });
}

export async function sendClanRosterDm(
  guild: Guild,
  requester: GuildMember,
  clanRole: Role,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isClanModerator(requester) && !isClanStaffFor(requester, clanRole.id)) {
    return { ok: false, error: clanTxt.cmdRosterNotYourClan(clanRole.name) };
  }

  await ensureGuildMembersCached(guild);
  const memberIds = listMemberIdsWithRole(guild, clanRole.id);
  const leaderIds = await listClanLeaderIds(guild, clanRole.id);
  const recruiterIds = await listClanRecruiterIds(guild, clanRole.id);
  const embed = buildClanRosterEmbed(guild, clanRole, memberIds, leaderIds, recruiterIds);

  try {
    await requester.send({ embeds: [embed] });
    return { ok: true };
  } catch {
    return { ok: false, error: clanTxt.rosterDmFailed };
  }
}

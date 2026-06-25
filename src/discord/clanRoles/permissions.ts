import type { Guild, GuildMember } from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS } from "../../config";
import { isDiscordModerator, memberRoleIds } from "../guildPermissions";
import type { ClanCreateRequest, ClanGrantRequest, ClanLeaderMetaRequest, ClanRecruiterMetaRequest } from "../types";
import { isClanLeaderFor, isClanRecruiterFor, isClanStaffFor } from "./resolver";

/** Clan staff (approvals, overrides) — `DISCORD_ADMIN_ROLE_IDS` only; moderators are treated as regular users. */
export function isClanModerator(member: GuildMember | null): boolean {
  if (DISCORD_ADMIN_ROLE_IDS.length === 0) return false;
  return memberRoleIds(member).some((id) => DISCORD_ADMIN_ROLE_IDS.includes(id));
}

export function canApproveGrantRequest(member: GuildMember, request: ClanGrantRequest): boolean {
  if (isClanModerator(member)) return true;
  return isClanStaffFor(member, request.clanRoleId);
}

export function canApproveRecruiterRequest(member: GuildMember, request: ClanRecruiterMetaRequest): boolean {
  if (isClanModerator(member)) return true;
  return isClanLeaderFor(member, request.clanRoleId);
}

/** Clan creation review — admins and line moderators (`DISCORD_MODERATOR_ROLE_IDS`). */
export function canApproveCreateRequest(member: GuildMember): boolean {
  return isClanModerator(member) || isDiscordModerator(member);
}

export function canResolveCreateRequest(
  member: GuildMember,
  request: ClanCreateRequest,
): boolean {
  if (request.status !== "pending") return false;
  return canApproveCreateRequest(member);
}

export function canResolveLeaderMetaModRequest(
  member: GuildMember,
  request: ClanLeaderMetaRequest,
): boolean {
  if (request.status !== "pending_mod") return false;
  return isClanModerator(member);
}

export function canGrantRecruiterDirect(member: GuildMember, clanRoleId: string): boolean {
  return isClanModerator(member) || isClanLeaderFor(member, clanRoleId);
}

export function canRemoveRecruiterMeta(
  member: GuildMember,
  clanRoleId: string,
  targetUserId: string,
): boolean {
  if (isClanModerator(member)) return true;
  if (member.id === targetUserId) return isClanRecruiterFor(member, clanRoleId);
  return isClanLeaderFor(member, clanRoleId);
}

/** Ping target on approval; ping requester too unless they approved their own request as clan leader. */
export function clanApprovalOutcomeMentionIds(
  request: { requesterUserId: string; targetUserId: string },
  approver: GuildMember,
): string[] {
  if (request.requesterUserId === request.targetUserId) {
    return [request.targetUserId];
  }
  const ids = [request.targetUserId];
  const approverIsRequester = approver.id === request.requesterUserId;
  if (!approverIsRequester || isClanModerator(approver)) {
    ids.push(request.requesterUserId);
  }
  return ids;
}

/** +клан grant: clan-leader requesters are never pinged — only the role recipient. */
export async function clanGrantApprovalMentionIds(
  guild: Guild,
  request: { requesterUserId: string; targetUserId: string; clanRoleId: string },
  approver: GuildMember,
): Promise<string[]> {
  if (request.requesterUserId === request.targetUserId) {
    return [request.targetUserId];
  }
  const requester = await guild.members.fetch(request.requesterUserId).catch(() => null);
  if (
    requester &&
    (isClanStaffFor(requester, request.clanRoleId) || isClanModerator(requester))
  ) {
    return [request.targetUserId];
  }
  return clanApprovalOutcomeMentionIds(request, approver);
}

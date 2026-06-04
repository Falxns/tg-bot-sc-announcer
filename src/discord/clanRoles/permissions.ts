import type { GuildMember } from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS } from "../../config";
import { memberRoleIds } from "../guildPermissions";
import type { ClanCreateRequest, ClanGrantRequest, ClanLeaderMetaRequest } from "../types";
import { isClanLeaderFor } from "./resolver";

/** Clan staff (approvals, overrides) — `DISCORD_ADMIN_ROLE_IDS` only; moderators are treated as regular users. */
export function isClanModerator(member: GuildMember | null): boolean {
  if (DISCORD_ADMIN_ROLE_IDS.length === 0) return false;
  return memberRoleIds(member).some((id) => DISCORD_ADMIN_ROLE_IDS.includes(id));
}

export function canApproveGrantRequest(member: GuildMember, request: ClanGrantRequest): boolean {
  if (isClanModerator(member)) return true;
  return isClanLeaderFor(member, request.clanRoleId);
}

export function canApproveCreateRequest(member: GuildMember): boolean {
  return isClanModerator(member);
}

export function canResolveCreateRequest(
  member: GuildMember,
  request: ClanCreateRequest,
): boolean {
  if (request.status !== "pending") return false;
  return canApproveCreateRequest(member);
}

export function canApproveLeaderMetaClanStage(
  member: GuildMember,
  request: ClanLeaderMetaRequest,
): boolean {
  if (request.status !== "pending_clan_leader") return false;
  if (member.id === request.targetUserId) return false;
  return isClanLeaderFor(member, request.clanRoleId);
}

export function canResolveLeaderMetaModRequest(
  member: GuildMember,
  request: ClanLeaderMetaRequest,
): boolean {
  if (request.status !== "pending_mod") return false;
  return canApproveCreateRequest(member);
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

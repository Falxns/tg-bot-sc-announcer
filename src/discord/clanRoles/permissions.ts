import type { GuildMember } from "discord.js";
import { isDiscordModerator } from "../guildPermissions";
import type { ClanCreateRequest, ClanGrantRequest } from "../types";
import { isClanLeaderFor } from "./resolver";

export function isClanModerator(member: GuildMember | null): boolean {
  return isDiscordModerator(member);
}

export function canApproveGrantRequest(member: GuildMember, request: ClanGrantRequest): boolean {
  if (isClanModerator(member)) return true;
  return isClanLeaderFor(member, request.clanRoleId);
}

export function canApproveCreateRequest(member: GuildMember): boolean {
  return isClanModerator(member);
}

export function canUseClanPanel(member: GuildMember): boolean {
  return true;
}

export function canResolveCreateRequest(
  member: GuildMember,
  request: ClanCreateRequest,
): boolean {
  if (request.status !== "pending") return false;
  return canApproveCreateRequest(member);
}

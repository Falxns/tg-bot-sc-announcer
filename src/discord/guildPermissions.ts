import { GuildMember, type APIInteractionGuildMember } from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS, DISCORD_MODERATOR_ROLE_IDS } from "../config";

export function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
  if (!member) return [];
  if (member instanceof GuildMember) return [...member.roles.cache.keys()];
  if (Array.isArray(member.roles)) return member.roles;
  return [];
}

/** `/post`, panels, etc. — when `DISCORD_ADMIN_ROLE_IDS` is empty, any member may pass (Discord still enforces command visibility). */
export function isDiscordAdmin(member: GuildMember | APIInteractionGuildMember | null): boolean {
  const allowed = DISCORD_ADMIN_ROLE_IDS;
  if (allowed.length === 0) return true;
  return memberRoleIds(member).some((id) => allowed.includes(id));
}

/**
 * Moderation slash (`/mute`, `/strike`, …).
 * Requires a role in `DISCORD_MODERATOR_ROLE_IDS` and/or `DISCORD_ADMIN_ROLE_IDS` when either list is set.
 * When both lists are empty, any member may pass (dev convenience; set roles in production).
 */
export function isDiscordModerator(member: GuildMember | APIInteractionGuildMember | null): boolean {
  const modIds = DISCORD_MODERATOR_ROLE_IDS;
  const adminIds = DISCORD_ADMIN_ROLE_IDS;
  if (modIds.length === 0 && adminIds.length === 0) return true;

  const roleIds = memberRoleIds(member);
  if (adminIds.length > 0 && roleIds.some((id) => adminIds.includes(id))) return true;
  if (modIds.length > 0 && roleIds.some((id) => modIds.includes(id))) return true;
  return false;
}

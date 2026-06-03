import { GuildMember, type APIInteractionGuildMember } from "discord.js";
import { DISCORD_ADMIN_ROLE_IDS, DISCORD_DEV_MODE, DISCORD_MODERATOR_ROLE_IDS } from "../config";

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
 * Punitive moderation (`/mute`, `/strike`, `/ban`, automod) must not target these members.
 * Unlike {@link isDiscordAdmin}, returns false when `DISCORD_ADMIN_ROLE_IDS` is empty.
 */
export function isModerationProtectedTarget(member: GuildMember | APIInteractionGuildMember | null): boolean {
  if (DISCORD_ADMIN_ROLE_IDS.length === 0) return false;
  return memberRoleIds(member).some((id) => DISCORD_ADMIN_ROLE_IDS.includes(id));
}

/**
 * Moderation slash (`/mute`, `/strike`, …).
 * Requires a role in `DISCORD_MODERATOR_ROLE_IDS` and/or `DISCORD_ADMIN_ROLE_IDS`.
 * When both lists are empty, denies everyone unless `DISCORD_DEV_MODE` is enabled.
 */
export function isDiscordModerator(member: GuildMember | APIInteractionGuildMember | null): boolean {
  const modIds = DISCORD_MODERATOR_ROLE_IDS;
  const adminIds = DISCORD_ADMIN_ROLE_IDS;
  if (modIds.length === 0 && adminIds.length === 0) return DISCORD_DEV_MODE;

  const roleIds = memberRoleIds(member);
  if (adminIds.length > 0 && roleIds.some((id) => adminIds.includes(id))) return true;
  if (modIds.length > 0 && roleIds.some((id) => modIds.includes(id))) return true;
  return false;
}

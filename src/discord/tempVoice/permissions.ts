import type { APIInteractionGuildMember, GuildMember } from "discord.js";
import { isDiscordAdmin, isDiscordModerator } from "../guildPermissions";
import type { TempVoiceRoomState } from "../types";

export function canControlTempVoiceRoom(
  member: GuildMember | APIInteractionGuildMember | null,
  room: TempVoiceRoomState,
): boolean {
  if (!member) return false;
  const userId = member.user?.id ?? (member as GuildMember).id;
  if (userId === room.ownerId) return true;
  if (isDiscordAdmin(member) || isDiscordModerator(member)) return true;
  return false;
}

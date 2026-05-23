import type { Guild, VoiceChannel } from "discord.js";
import { ChannelType } from "discord.js";
import {
  DISCORD_VOICE_EMPTY_DELETE_MS,
  DISCORD_VOICE_HUB_CHANNEL_ID,
  DISCORD_VOICE_TEMP_CATEGORY_ID,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  tempVoiceConfigured,
} from "../../config";
import {
  deleteTempVoiceRoom,
  getTempVoiceRoom,
  saveState,
  tempVoiceRooms,
} from "../../state";

const emptyDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Hub and other fixed channels must never be removed by startup/orphan sweeps. */
export function isProtectedVoiceChannel(channelId: string): boolean {
  return DISCORD_VOICE_HUB_CHANNEL_ID.length > 0 && channelId === DISCORD_VOICE_HUB_CHANNEL_ID;
}

export function cancelEmptyDeleteTimer(voiceChannelId: string): void {
  const t = emptyDeleteTimers.get(voiceChannelId);
  if (t) {
    clearTimeout(t);
    emptyDeleteTimers.delete(voiceChannelId);
  }
}

export async function deleteTempVoiceRoomFull(guild: Guild, voiceChannelId: string): Promise<void> {
  if (isProtectedVoiceChannel(voiceChannelId)) return;
  cancelEmptyDeleteTimer(voiceChannelId);
  const room = getTempVoiceRoom(voiceChannelId);
  if (room?.textChannelId) {
    const textCh = await guild.channels.fetch(room.textChannelId).catch(() => null);
    if (textCh) await textCh.delete().catch(() => undefined);
  }
  const voiceCh = await guild.channels.fetch(voiceChannelId).catch(() => null);
  if (voiceCh) await voiceCh.delete().catch(() => undefined);
  deleteTempVoiceRoom(voiceChannelId);
  await saveState(LAST_SEEN_STATE_FILE);
}

export function scheduleEmptyDeleteIfNeeded(guild: Guild, channel: VoiceChannel): void {
  const room = getTempVoiceRoom(channel.id);
  if (!room) return;
  if (channel.members.size > 0) {
    cancelEmptyDeleteTimer(channel.id);
    return;
  }
  if (emptyDeleteTimers.has(channel.id)) return;
  const channelId = channel.id;
  const timer = setTimeout(() => {
    emptyDeleteTimers.delete(channelId);
    void (async () => {
      try {
        const ch = await guild.channels.fetch(channelId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildVoice) {
          deleteTempVoiceRoom(channelId);
          await saveState(LAST_SEEN_STATE_FILE);
          return;
        }
        if (ch.members.size > 0) return;
        await deleteTempVoiceRoomFull(guild, channelId);
        if (LOG_LEVEL === "debug") {
          console.log(`[Temp voice] deleted empty room ${channelId}`);
        }
      } catch (err) {
        console.error("[Temp voice] empty delete failed:", err);
      }
    })();
  }, DISCORD_VOICE_EMPTY_DELETE_MS);
  emptyDeleteTimers.set(channel.id, timer);
}

export async function sweepTempVoiceOnReady(guild: Guild): Promise<void> {
  if (!tempVoiceConfigured()) return;
  const categoryId = DISCORD_VOICE_TEMP_CATEGORY_ID;
  const stale: string[] = [];
  for (const [voiceChannelId] of tempVoiceRooms) {
    const ch = await guild.channels.fetch(voiceChannelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildVoice) stale.push(voiceChannelId);
    else if (ch.members.size === 0) scheduleEmptyDeleteIfNeeded(guild, ch);
  }
  for (const id of stale) {
    deleteTempVoiceRoom(id);
  }
  if (stale.length > 0) await saveState(LAST_SEEN_STATE_FILE);

  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== 4) return;
  for (const ch of category.children.cache.values()) {
    if (!ch.isVoiceBased()) continue;
    if (isProtectedVoiceChannel(ch.id)) continue;
    if (getTempVoiceRoom(ch.id)) continue;
    if (ch.members.size === 0) {
      await ch.delete().catch(() => undefined);
    }
  }
}

export function isManagedTempVoiceChannel(channelId: string): boolean {
  return tempVoiceRooms.has(channelId);
}

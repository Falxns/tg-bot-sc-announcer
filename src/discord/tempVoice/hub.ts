import {
  ChannelType,
  Guild,
  GuildMember,
  VoiceChannel,
  VoiceState,
} from "discord.js";
import {
  DISCORD_GUILD_ID,
  DISCORD_VOICE_DEFAULT_NAME,
  DISCORD_VOICE_HUB_CHANNEL_ID,
  DISCORD_VOICE_MAX_CHANNELS_PER_USER,
  DISCORD_VOICE_TEMP_CATEGORY_ID,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  tempVoiceConfigured,
} from "../../config";
import {
  deleteTempVoiceRoom,
  findTempVoiceRoomByOwner,
  saveState,
  setTempVoiceRoom,
} from "../../state";
import type { TempVoiceRoomState } from "../types";
import { ensureBotChannelAccess, setEveryoneVoiceConnect } from "./channelAccess";
import { cancelEmptyDeleteTimer, isManagedTempVoiceChannel, scheduleEmptyDeleteIfNeeded } from "./lifecycle";

function sanitizeChannelName(raw: string): string {
  const s = raw.replace(/[^\p{L}\p{N}\s\-_|]/gu, "").trim().slice(0, 100);
  return s.length > 0 ? s : "Голосовой канал";
}

function asGuildVoiceChannel(ch: { type: ChannelType } | null): VoiceChannel | null {
  return ch?.type === ChannelType.GuildVoice ? (ch as VoiceChannel) : null;
}

async function applyOwnerOverwrites(channel: VoiceChannel, ownerId: string): Promise<void> {
  await ensureBotChannelAccess(channel);
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: null });
  await channel.permissionOverwrites.create(ownerId, {
    Connect: true,
    ViewChannel: true,
    ManageChannels: true,
    MoveMembers: true,
  });
}

async function createTempVoiceForMember(guild: Guild, member: GuildMember): Promise<VoiceChannel | null> {
  const displayName = member.displayName || member.user.username;
  const name = sanitizeChannelName(DISCORD_VOICE_DEFAULT_NAME.replace(/\{user\}/gi, displayName));
  try {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: DISCORD_VOICE_TEMP_CATEGORY_ID,
      reason: `Temp voice for ${member.user.tag}`,
    });
    const room: TempVoiceRoomState = {
      guildId: guild.id,
      voiceChannelId: channel.id,
      ownerId: member.id,
      locked: false,
      createdAt: Date.now(),
    };
    setTempVoiceRoom(room);
    await applyOwnerOverwrites(channel, member.id);
    await saveState(LAST_SEEN_STATE_FILE);
    if (LOG_LEVEL === "debug") {
      console.log(`[Temp voice] created ${channel.id} for ${member.id}`);
    }
    return channel;
  } catch (err) {
    console.error("[Temp voice] create channel failed:", err);
    return null;
  }
}

async function handleHubJoin(guild: Guild, member: GuildMember): Promise<void> {
  const existing = findTempVoiceRoomByOwner(guild.id, member.id);
  if (existing) {
    const ch = asGuildVoiceChannel(await guild.channels.fetch(existing.voiceChannelId).catch(() => null));
    if (ch) {
      try {
        await member.voice.setChannel(ch);
        return;
      } catch (err) {
        console.error("[Temp voice] move to existing room failed:", err);
      }
    } else {
      deleteTempVoiceRoom(existing.voiceChannelId);
      await saveState(LAST_SEEN_STATE_FILE);
    }
  }

  if (DISCORD_VOICE_MAX_CHANNELS_PER_USER <= 0) return;

  const channel = await createTempVoiceForMember(guild, member);
  if (!channel) return;
  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    console.error("[Temp voice] move to new room failed:", err);
    await channel.delete().catch(() => undefined);
    deleteTempVoiceRoom(channel.id);
    await saveState(LAST_SEEN_STATE_FILE);
  }
}

export async function handleTempVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (!tempVoiceConfigured()) return;
  const guild = newState.guild ?? oldState.guild;
  if (!guild || guild.id !== DISCORD_GUILD_ID) return;

  const hubId = DISCORD_VOICE_HUB_CHANNEL_ID;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  if (newState.channelId === hubId && oldState.channelId !== hubId) {
    await handleHubJoin(guild, member);
    return;
  }

  const leftId = oldState.channelId;
  if (leftId && leftId !== hubId && isManagedTempVoiceChannel(leftId)) {
    cancelEmptyDeleteTimer(leftId);
    const ch = asGuildVoiceChannel(await guild.channels.fetch(leftId).catch(() => null));
    if (ch) scheduleEmptyDeleteIfNeeded(guild, ch);
  }

  const joinedId = newState.channelId;
  if (joinedId && joinedId !== hubId && isManagedTempVoiceChannel(joinedId)) {
    cancelEmptyDeleteTimer(joinedId);
  }
}

export async function resolveOwnerVoiceChannel(
  guild: Guild,
  ownerId: string,
): Promise<{ room: TempVoiceRoomState; channel: VoiceChannel } | null> {
  const room = findTempVoiceRoomByOwner(guild.id, ownerId);
  if (!room) return null;
  const ch = asGuildVoiceChannel(await guild.channels.fetch(room.voiceChannelId).catch(() => null));
  if (!ch) {
    deleteTempVoiceRoom(room.voiceChannelId);
    await saveState(LAST_SEEN_STATE_FILE);
    return null;
  }
  return { room, channel: ch };
}

export async function transferTempVoiceOwnership(
  channel: VoiceChannel,
  room: TempVoiceRoomState,
  newOwnerId: string,
): Promise<void> {
  const oldOwnerId = room.ownerId;
  if (oldOwnerId === newOwnerId) return;

  await channel.permissionOverwrites.delete(oldOwnerId).catch(() => undefined);

  const existing = channel.permissionOverwrites.cache.get(newOwnerId);
  if (existing) {
    await channel.permissionOverwrites.edit(newOwnerId, {
      Connect: true,
      ViewChannel: true,
      ManageChannels: true,
      MoveMembers: true,
    });
  } else {
    await channel.permissionOverwrites.create(newOwnerId, {
      Connect: true,
      ViewChannel: true,
      ManageChannels: true,
      MoveMembers: true,
    });
  }

  room.ownerId = newOwnerId;
  setTempVoiceRoom(room);
  await saveState(LAST_SEEN_STATE_FILE);
}

export async function setRoomLocked(channel: VoiceChannel, room: TempVoiceRoomState, locked: boolean): Promise<void> {
  await setEveryoneVoiceConnect(channel, locked ? "closed" : "open");
  room.locked = locked;
  setTempVoiceRoom(room);
  await saveState(LAST_SEEN_STATE_FILE);
}

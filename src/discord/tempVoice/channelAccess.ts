import { PermissionFlagsBits, VoiceChannel } from "discord.js";

const BOT_CHANNEL_PERMS = {
  ViewChannel: true,
  Connect: true,
  ManageChannels: true,
  MoveMembers: true,
} as const;

/** Explicit bot overwrite so lock/unlock/delete still work after @everyone Connect deny. */
export async function ensureBotChannelAccess(channel: VoiceChannel): Promise<void> {
  const me = channel.guild.members.me;
  if (!me) {
    throw new Error("Bot member not available in guild cache");
  }
  const existing = channel.permissionOverwrites.cache.get(me.id);
  if (existing) {
    await channel.permissionOverwrites.edit(me.id, BOT_CHANNEL_PERMS);
  } else {
    await channel.permissionOverwrites.create(me.id, BOT_CHANNEL_PERMS);
  }
}

export async function setEveryoneVoiceConnect(
  channel: VoiceChannel,
  mode: "open" | "closed",
): Promise<void> {
  await ensureBotChannelAccess(channel);
  const everyone = channel.guild.roles.everyone;
  if (mode === "closed") {
    await channel.permissionOverwrites.edit(everyone, { Connect: false });
    return;
  }
  const everyoneOw = channel.permissionOverwrites.cache.get(everyone.id);
  if (everyoneOw?.deny.has(PermissionFlagsBits.Connect)) {
    await channel.permissionOverwrites.delete(everyone);
    return;
  }
  await channel.permissionOverwrites.edit(everyone, { Connect: true });
}

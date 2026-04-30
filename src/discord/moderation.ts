import { GuildMember, Message } from "discord.js";
import {
  DISCORD_BLOCK_INVITE_LINKS_GLOBAL,
  DISCORD_CHANNEL_POLICIES,
  DISCORD_INVITE_ALLOWED_ROLE_IDS,
  DISCORD_TIMEOUT_MS,
  DISCORD_WARNING_MESSAGE_TTL_MS,
  DISCORD_WARNINGS_BEFORE_TIMEOUT,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
} from "../config";
import { incrementDiscordWarning, saveState } from "../state";

function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

function hasExternalInvite(text: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i.test(text);
}

function isVideoAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("video/")) return true;
  return /\.(mp4|mov|mkv|webm|avi|wmv)$/i.test(fileName);
}

function isImageAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

function moderationLogUserLabel(member: GuildMember, author: Message["author"]): string {
  const display = member.displayName?.trim();
  if (display && display.length > 0) return display.replace(/\s+/g, " ").slice(0, 64);
  const username = (author.globalName ?? author.username)?.trim();
  if (username && username.length > 0) return username.replace(/\s+/g, " ").slice(0, 64);
  return author.id;
}

function moderationLogChannelLabel(message: Message): string {
  const ch = message.channel;
  if (ch && typeof ch === "object" && "name" in ch && typeof (ch as { name?: string }).name === "string") {
    const name = (ch as { name: string }).name.trim();
    if (name.length > 0) return name.replace(/\s+/g, " ").slice(0, 80);
  }
  return message.channelId;
}

async function deleteLater(message: Message, delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  setTimeout(() => {
    void message.delete().catch(() => undefined);
  }, delayMs);
}

export async function handleModerationMessage(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  if (message.author.bot || message.system) return;
  const member = message.member;
  if (!(member instanceof GuildMember)) return;

  const policy = DISCORD_CHANNEL_POLICIES[message.channelId];
  let violation: string | null = null;
  const text = message.content.trim();
  const lower = text.toLowerCase();

  const inviteRoleAllow = [...DISCORD_INVITE_ALLOWED_ROLE_IDS, ...(policy?.allowInviteRoleIds ?? [])];
  const shouldCheckInvites = DISCORD_BLOCK_INVITE_LINKS_GLOBAL || policy?.blockInviteLinks === true;
  if (shouldCheckInvites && hasExternalInvite(text) && !hasAnyRole(member, inviteRoleAllow)) {
    violation = "В этом канале запрещены приглашения Discord.";
  }

  const attachments = [...message.attachments.values()];
  if (!violation && policy?.blockVideos) {
    const hasVideo = attachments.some((a) => isVideoAttachment(a.contentType, a.name ?? ""));
    if (hasVideo) violation = "В этом канале запрещены видеовложения.";
  }
  if (!violation && policy?.blockImages) {
    const hasImage = attachments.some((a) => isImageAttachment(a.contentType, a.name ?? ""));
    if (hasImage) violation = "В этом канале запрещены изображения.";
  }
  if (!violation && policy?.blockText && text.length > 0) {
    violation = "В этом канале запрещены текстовые сообщения.";
  }
  if (!violation && policy?.blockedKeywords && policy.blockedKeywords.length > 0) {
    const hit = policy.blockedKeywords.find((w) => lower.includes(w));
    if (hit) violation = `Обнаружено запрещённое слово: «${hit}».`;
  }
  if (!violation) return;

  try {
    await message.delete();
  } catch (err) {
    console.error("Discord moderation failed to delete message:", err);
    return;
  }

  const warningCount = incrementDiscordWarning(message.guildId, message.author.id);
  await saveState(LAST_SEEN_STATE_FILE);

  const warning = await message.channel.send(
    `<@${message.author.id}> ${violation} Предупреждение ${warningCount}/${DISCORD_WARNINGS_BEFORE_TIMEOUT}.`,
  );
  await deleteLater(warning, DISCORD_WARNING_MESSAGE_TTL_MS);

  if (warningCount >= DISCORD_WARNINGS_BEFORE_TIMEOUT && member.moderatable) {
    try {
      await member.timeout(DISCORD_TIMEOUT_MS, "Превышен порог автоматической модерации");
      const timeoutNotice = await message.channel.send(
        `<@${message.author.id}> выдан таймаут на ${Math.floor(DISCORD_TIMEOUT_MS / 60000)} мин.`,
      );
      await deleteLater(timeoutNotice, DISCORD_WARNING_MESSAGE_TTL_MS);
    } catch (err) {
      console.error("Discord moderation timeout failed:", err);
    }
  }

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    const userLabel = moderationLogUserLabel(member, message.author);
    const channelLabel = moderationLogChannelLabel(message);
    console.log(
      `[Discord moderation] user=${message.author.id} (${userLabel}) channel=${message.channelId} (${channelLabel}) reason=${violation} warnings=${warningCount}`,
    );
  }
}

import {
  AttachmentBuilder,
  AuditLogEvent,
  EmbedBuilder,
  Guild,
  GuildMember,
  type Message,
  type PartialMessage,
} from "discord.js";
import {
  DISCORD_GUILD_ID,
  DISCORD_MESSAGE_REVIEW_AUDIT_DELAY_MS,
  DISCORD_MESSAGE_REVIEW_BYPASS_ROLE_IDS,
  DISCORD_MESSAGE_REVIEW_CHANNEL_ID,
  DISCORD_MESSAGE_REVIEW_INCLUDE_URLS,
  DISCORD_MESSAGE_REVIEW_MAX_ATTACHMENT_MB,
  DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_SET,
  LOG_LEVEL,
} from "../config";
import {
  deleteCachedMessageReview,
  setCachedMessageReview,
  takeCachedMessageReview,
  type CachedAttachmentRef,
  type CachedMessageReview,
} from "./messageReviewCache";
import { discordMessageReview as reviewTxt } from "./userStrings";

/** Discord MESSAGE_DELETE audit entries use the message author as target_id, not the message snowflake. */
const MESSAGE_DELETE_AUDIT_MAX_AGE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVideoAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("video/")) return true;
  return /\.(mp4|mov|mkv|webm|avi|wmv)$/i.test(fileName);
}

function isImageAttachment(contentType: string | null, fileName: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    let u = m[0];
    u = u.replace(/[).,;]+$/g, "");
    if (u.length > 2) out.push(u);
  }
  return out;
}

function hasAnyRole(member: GuildMember, roleIds: readonly string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

export function messageReviewEnabled(): boolean {
  return (
    DISCORD_MESSAGE_REVIEW_CHANNEL_ID.length > 0 && DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_SET.size > 0
  );
}

/** Drop cache entry when automod (or elsewhere) removes the message — no review post. */
export function evictMessageReviewCache(messageId: string): void {
  if (!messageReviewEnabled()) return;
  deleteCachedMessageReview(messageId);
}

function collectEmbedImageUrls(message: Message): string[] {
  const urls: string[] = [];
  for (const e of message.embeds) {
    if (e.image?.url) urls.push(e.image.url);
    if (e.thumbnail?.url) urls.push(e.thumbnail.url);
  }
  return urls;
}

function messageQualifiesForReview(message: Message): boolean {
  const attachments = [...message.attachments.values()];
  const hasMediaAttachment = attachments.some(
    (a) =>
      isImageAttachment(a.contentType, a.name ?? "") || isVideoAttachment(a.contentType, a.name ?? ""),
  );
  if (hasMediaAttachment) return true;
  if (message.stickers.size > 0) return true;
  if (collectEmbedImageUrls(message).length > 0) return true;
  if (!DISCORD_MESSAGE_REVIEW_INCLUDE_URLS) return false;
  const searchable = [message.content, ...message.embeds.map((e) => e.url ?? "")].join("\n");
  return extractUrls(searchable).length > 0;
}

function buildCacheEntry(message: Message): CachedMessageReview {
  const attachments: CachedAttachmentRef[] = [...message.attachments.values()].map((a) => ({
    url: a.url,
    name: a.name ?? "attachment",
    contentType: a.contentType,
    size: a.size,
  }));
  for (const sticker of message.stickers.values()) {
    attachments.push({
      url: sticker.url,
      name: `${sticker.name || "sticker"}.png`,
      contentType: "image/png",
      size: 0,
    });
  }
  return {
    messageId: message.id,
    channelId: message.channelId,
    guildId: message.guildId!,
    authorId: message.author.id,
    content: message.content?.slice(0, 2000) ?? "",
    attachments,
    embedImageUrls: collectEmbedImageUrls(message),
    cachedAt: Date.now(),
  };
}

function messageDeleteAuditChannelId(entry: { extra: unknown }): string | undefined {
  const extra = entry.extra as { channel?: { id?: string } } | null;
  const ch = extra?.channel;
  if (ch && typeof ch.id === "string") return ch.id;
  return undefined;
}

/**
 * Returns executor id when a mod/admin (or bot) deleted the message via Discord UI.
 * Self-deletes are usually not audited; no matching entry ⇒ undefined.
 */
async function resolveStaffMessageDeleteExecutor(
  guild: Guild,
  cached: CachedMessageReview,
): Promise<string | undefined> {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 12 });
    const now = Date.now();
    for (const entry of logs.entries.values()) {
      if (entry.targetId !== cached.authorId) continue;
      const auditChannelId = messageDeleteAuditChannelId(entry);
      if (auditChannelId && auditChannelId !== cached.channelId) continue;
      if (now - entry.createdTimestamp > MESSAGE_DELETE_AUDIT_MAX_AGE_MS) continue;
      if (!entry.executor) continue;
      return entry.executor.id;
    }
  } catch (err) {
    console.error("Message review audit log fetch failed:", err);
  }
  return undefined;
}

async function buildAttachmentFiles(
  attachments: CachedAttachmentRef[],
  embedImageUrls: string[],
): Promise<{ files: AttachmentBuilder[]; linkOnlyLines: string[] }> {
  const maxBytes = DISCORD_MESSAGE_REVIEW_MAX_ATTACHMENT_MB * 1024 * 1024;
  const files: AttachmentBuilder[] = [];
  const linkOnlyLines: string[] = [];

  const allRefs: { url: string; name: string }[] = [
    ...attachments.map((a) => ({ url: a.url, name: a.name })),
    ...embedImageUrls.map((url, i) => ({ url, name: `embed-${i + 1}.png` })),
  ];

  for (const ref of allRefs) {
    const attMeta = attachments.find((a) => a.url === ref.url);
    if (attMeta && attMeta.size > maxBytes) {
      linkOnlyLines.push(reviewTxt.attachmentLinkOnly(ref.name, ref.url));
      continue;
    }
    try {
      const res = await fetch(ref.url);
      if (!res.ok) {
        linkOnlyLines.push(reviewTxt.attachmentFetchFail(ref.name, ref.url));
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) {
        linkOnlyLines.push(reviewTxt.attachmentLinkOnly(ref.name, ref.url));
        continue;
      }
      files.push(new AttachmentBuilder(buf).setName(ref.name.slice(0, 200)));
    } catch {
      linkOnlyLines.push(reviewTxt.attachmentFetchFail(ref.name, ref.url));
    }
  }

  return { files, linkOnlyLines };
}

async function postReviewForDeletedMessage(guild: Guild, cached: CachedMessageReview): Promise<void> {
  const ch = await guild.channels.fetch(DISCORD_MESSAGE_REVIEW_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || !("send" in ch)) return;

  const jumpUrl = `https://discord.com/channels/${cached.guildId}/${cached.channelId}/${cached.messageId}`;
  const header = reviewTxt.deletedHeader(cached.authorId, cached.channelId, jumpUrl);

  const contentBlock =
    cached.content.trim().length > 0
      ? reviewTxt.deletedContentBlock(cached.content)
      : reviewTxt.deletedNoText;

  const { files, linkOnlyLines } = await buildAttachmentFiles(cached.attachments, cached.embedImageUrls);

  const bodyParts = [header, "", contentBlock];
  if (linkOnlyLines.length > 0) {
    bodyParts.push("", linkOnlyLines.join("\n"));
  }

  const embed = new EmbedBuilder().setDescription(bodyParts.join("\n").slice(0, 4096));

  await ch.send({
    content: reviewTxt.deletedPing(cached.authorId),
    embeds: [embed],
    files: files.slice(0, 10),
  });
}

export async function handleMessageReviewCreate(message: Message): Promise<void> {
  if (!messageReviewEnabled()) return;
  if (!message.inGuild()) return;
  if (message.guildId !== DISCORD_GUILD_ID) return;
  if (message.author.bot || message.system) return;

  const ch = message.channel;
  if (ch.isDMBased() || ch.isThread()) return;
  if (!DISCORD_MESSAGE_REVIEW_SOURCE_CHANNEL_SET.has(message.channelId)) return;
  if (message.channelId === DISCORD_MESSAGE_REVIEW_CHANNEL_ID) return;

  const member = message.member;
  if (!(member instanceof GuildMember)) return;
  if (hasAnyRole(member, DISCORD_MESSAGE_REVIEW_BYPASS_ROLE_IDS)) return;

  if (!messageQualifiesForReview(message)) return;

  setCachedMessageReview(buildCacheEntry(message));

  if (LOG_LEVEL === "debug") {
    console.log(`[Message review] cached ${message.id} in ${message.channelId}`);
  }
}

export async function handleMessageReviewDelete(message: Message | PartialMessage): Promise<void> {
  if (!messageReviewEnabled()) return;
  if (!message.guildId || message.guildId !== DISCORD_GUILD_ID) return;

  const cached = takeCachedMessageReview(message.id);
  if (!cached) return;

  const guild = message.guild ?? (await message.client.guilds.fetch(cached.guildId).catch(() => null));
  if (!guild) return;

  await sleep(DISCORD_MESSAGE_REVIEW_AUDIT_DELAY_MS);

  const executorId = await resolveStaffMessageDeleteExecutor(guild, cached);
  const botId = guild.client.user?.id;

  if (executorId && (executorId === botId || executorId !== cached.authorId)) {
    if (LOG_LEVEL === "debug") {
      console.log(`[Message review] skip ${message.id}: staff/bot delete by ${executorId}`);
    }
    return;
  }

  try {
    await postReviewForDeletedMessage(guild, cached);
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
      console.log(`[Message review] posted self-delete review for ${message.id}`);
    }
  } catch (err) {
    console.error("Message review channel post failed:", err);
  }
}

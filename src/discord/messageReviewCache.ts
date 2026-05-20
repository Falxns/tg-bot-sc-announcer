import { DISCORD_MESSAGE_REVIEW_CACHE_TTL_MS, DISCORD_MESSAGE_REVIEW_MAX_CACHE_ENTRIES } from "../config";

export type CachedAttachmentRef = {
  url: string;
  name: string;
  contentType: string | null;
  size: number;
};

export type CachedMessageReview = {
  messageId: string;
  channelId: string;
  guildId: string;
  authorId: string;
  content: string;
  attachments: CachedAttachmentRef[];
  embedImageUrls: string[];
  cachedAt: number;
};

const cache = new Map<string, CachedMessageReview>();

function pruneExpired(nowMs: number): void {
  const ttl = DISCORD_MESSAGE_REVIEW_CACHE_TTL_MS;
  for (const [id, entry] of cache) {
    if (nowMs - entry.cachedAt > ttl) cache.delete(id);
  }
}

function evictOldestIfOverCap(): void {
  const max = DISCORD_MESSAGE_REVIEW_MAX_CACHE_ENTRIES;
  if (cache.size <= max) return;
  const sorted = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  const remove = cache.size - max;
  for (let i = 0; i < remove; i++) {
    cache.delete(sorted[i]![0]);
  }
}

export function setCachedMessageReview(entry: CachedMessageReview): void {
  const now = Date.now();
  pruneExpired(now);
  cache.set(entry.messageId, entry);
  evictOldestIfOverCap();
}

export function takeCachedMessageReview(messageId: string): CachedMessageReview | undefined {
  const entry = cache.get(messageId);
  if (!entry) return undefined;
  cache.delete(messageId);
  return entry;
}

export function deleteCachedMessageReview(messageId: string): boolean {
  return cache.delete(messageId);
}

export function getMessageReviewCacheSize(): number {
  return cache.size;
}

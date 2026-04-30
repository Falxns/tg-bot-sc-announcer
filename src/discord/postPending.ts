import { randomUUID } from "crypto";
import type { DiscordRolePanelButton } from "./types";

export type PendingAttachmentRef = {
  url: string;
  name: string;
};

export type PendingPostPayload = {
  guildId: string;
  channelId: string;
  /** Who opened the form — only this user may submit. */
  userId: string;
  /** Optional image/file from the slash command (URL on Discord CDN); re-fetched when posting. */
  attachments?: PendingAttachmentRef[];
  /** Optional embed set on the slash command (applied to the first posted message). */
  embedTitle?: string;
  embedDescription?: string;
  embedUrl?: string;
  embedColor?: number;
  embedThumbnailUrl?: string;
  embedImageUrl?: string;
  embedFooter?: string;
  embedFooterIconUrl?: string;
  embedAuthorName?: string;
  embedAuthorIconUrl?: string;
  expiresAt: number;
};

type PanelEmbedFields = Pick<
  PendingPostPayload,
  | "embedTitle"
  | "embedDescription"
  | "embedUrl"
  | "embedColor"
  | "embedThumbnailUrl"
  | "embedImageUrl"
  | "embedFooter"
  | "embedFooterIconUrl"
  | "embedAuthorName"
  | "embedAuthorIconUrl"
>;

export type PendingRolePanelPayload = PanelEmbedFields & {
  guildId: string;
  channelId: string;
  userId: string;
  buttons: DiscordRolePanelButton[];
  expiresAt: number;
};

export type PendingLinkPanelLink = {
  url: string;
  label: string;
  emoji?: { id: string; name: string; animated: boolean };
};

export type PendingLinkPanelPayload = PanelEmbedFields & {
  guildId: string;
  channelId: string;
  userId: string;
  links: PendingLinkPanelLink[];
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;
const pendingByNonce = new Map<string, PendingPostPayload>();
const pendingRolePanelByNonce = new Map<string, PendingRolePanelPayload>();
const pendingLinkPanelByNonce = new Map<string, PendingLinkPanelPayload>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of pendingByNonce) {
    if (v.expiresAt <= now) pendingByNonce.delete(k);
  }
  for (const [k, v] of pendingRolePanelByNonce) {
    if (v.expiresAt <= now) pendingRolePanelByNonce.delete(k);
  }
  for (const [k, v] of pendingLinkPanelByNonce) {
    if (v.expiresAt <= now) pendingLinkPanelByNonce.delete(k);
  }
}

export function createPendingPost(payload: Omit<PendingPostPayload, "expiresAt">): string {
  pruneExpired();
  const nonce = randomUUID();
  pendingByNonce.set(nonce, { ...payload, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

export function takePendingPost(nonce: string): PendingPostPayload | undefined {
  pruneExpired();
  const v = pendingByNonce.get(nonce);
  if (!v) return undefined;
  pendingByNonce.delete(nonce);
  if (v.expiresAt <= Date.now()) return undefined;
  return v;
}

export function createPendingRolePanel(payload: Omit<PendingRolePanelPayload, "expiresAt">): string {
  pruneExpired();
  const nonce = randomUUID();
  pendingRolePanelByNonce.set(nonce, { ...payload, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

export function takePendingRolePanel(nonce: string): PendingRolePanelPayload | undefined {
  pruneExpired();
  const v = pendingRolePanelByNonce.get(nonce);
  if (!v) return undefined;
  pendingRolePanelByNonce.delete(nonce);
  if (v.expiresAt <= Date.now()) return undefined;
  return v;
}

export function createPendingLinkPanel(payload: Omit<PendingLinkPanelPayload, "expiresAt">): string {
  pruneExpired();
  const nonce = randomUUID();
  pendingLinkPanelByNonce.set(nonce, { ...payload, expiresAt: Date.now() + TTL_MS });
  return nonce;
}

export function takePendingLinkPanel(nonce: string): PendingLinkPanelPayload | undefined {
  pruneExpired();
  const v = pendingLinkPanelByNonce.get(nonce);
  if (!v) return undefined;
  pendingLinkPanelByNonce.delete(nonce);
  if (v.expiresAt <= Date.now()) return undefined;
  return v;
}

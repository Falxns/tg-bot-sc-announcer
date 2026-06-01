import { LOG_LEVEL, POSTS_PER_AUTHOR, STATE_BACKEND } from "./config";
import {
  loadSpamFilterFingerprintsFromState,
  pruneSpamFilterFingerprintsForSave,
  serializeSpamFilterFingerprintsForState,
} from "./discord/spamFilterCache";
import type {
  ClanCreateRequest,
  ClanGrantRequest,
  ClanLeaderMetaRequest,
  ClanRoleEnforcementState,
  ClanRulesPanelState,
  DiscordRolePanelState,
  TempVoicePanelState,
  TempVoiceRoomState,
} from "./discord/types";
import { createStateStore } from "./stateStore";

export const DEFAULT_EXBO_AUTHORS = [
  "Marxont",
  "dolgodoomal",
  "zubzalinaza",
  "Kommynist",
  "Mediocree",
  "ZIV",
  "Furgon",
  "pinkDog",
  "barmeh34",
  "normist",
  "_Emelasha_",
  "ooveronika",
  "6eximmortal",
  "AngryKitty",
  "grin_d",
  "nastexe",
  "Erildorian",
  "litrkerasina",
  "psychosociaI",
  "Plastinka",
  "ProstoDuke",
  "CeredJa",
  "Folken",
  "Tarnum",
  "t_lightwood",
  "SMEKTA",
  "RomeO",
  "stm:76561198077736822",
  "Jilee",
  "Gorlyli",
  "Tigorex",
  "Velery",
  "HiPPiE",
  "Opisth",
  "heheckler",
  "WWtddw",
  "Targgot",
  "Kazugaia",
  "DikiyTaburet",
  "Kotler",
];

/** Exbo forum usernames to poll for new comments. Loaded from state storage, falls back to DEFAULT_EXBO_AUTHORS. */
export let exboAuthors: string[] = [...DEFAULT_EXBO_AUTHORS];

/** Replace the tracked author list (e.g. after /removeauthor). */
export function replaceExboAuthors(next: string[]): void {
  exboAuthors = next;
}

/** Per-author: list of last seen post IDs (oldest first). At most POSTS_PER_AUTHOR per author. */
export const lastSeenByAuthor = new Map<string, string[]>();
/** Persisted role panel definitions keyed by Discord message ID. */
export const discordRolePanels = new Map<string, DiscordRolePanelState>();
/** Temp voice rooms keyed by voice channel snowflake. */
export const tempVoiceRooms = new Map<string, TempVoiceRoomState>();
/** Temp voice control panel message (optional, for rehydrate). */
export const tempVoicePanel = new Map<string, TempVoicePanelState>();

/** Clan help message + rules thread config keyed by bot message id. */
export const clanRulesPanels = new Map<string, ClanRulesPanelState>();
/** Pending grant requests keyed by request id. */
export const clanGrantRequests = new Map<string, ClanGrantRequest>();
/** Pending mod-reviewed create requests keyed by request id. */
export const clanCreateRequests = new Map<string, ClanCreateRequest>();
/** Pending leader-meta grant requests keyed by request id. */
export const clanLeaderMetaRequests = new Map<string, ClanLeaderMetaRequest>();
/** Understaffed / leaderless grace tracking keyed by `${guildId}:${clanRoleId}`. */
export const clanRoleEnforcement = new Map<string, ClanRoleEnforcementState>();
/** Last clan enforcement sweep timestamp (ms). */
export let clanEnforcementLastRunAtMs = 0;

/** Server-wide warn count: `${guildId}:${userId}`. */
export const discordGlobalWarns = new Map<string, number>();
/** Unified mute ladder index: `${guildId}:${userId}` → tier (0…last). */
export const discordMuteTier = new Map<string, number>();
/** Last moderation violation time (ms): `${guildId}:${userId}` for decay. */
export const discordModerationLastViolationAt = new Map<string, number>();
/** Last creator staff-summary digest (ms): `${guildId}:${userId}:${channelId}`. */
export const discordStaffSummaryCreatorLastAt = new Map<string, number>();
/** Punitive slash uses per UTC day: `${guildId}:${staffUserId}:${YYYY-MM-DD}`. */
export const discordModeratorDailyQuota = new Map<string, number>();

const ROLE_BUTTON_PREFIX = "role:";
const ROLE_BUTTON_SINGLE_PREFIX = "roleone:";

export function guildUserKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function creatorSummaryKey(guildId: string, userId: string, channelId: string): string {
  return `${guildId}:${userId}:${channelId}`;
}

export function utcQuotaDateString(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function moderatorDailyQuotaKey(guildId: string, staffUserId: string, dateUtc: string): string {
  return `${guildId}:${staffUserId}:${dateUtc}`;
}

export function getModeratorDailyQuotaUsed(guildId: string, staffUserId: string, nowMs: number): number {
  const key = moderatorDailyQuotaKey(guildId, staffUserId, utcQuotaDateString(nowMs));
  const v = discordModeratorDailyQuota.get(key);
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

function pruneModeratorQuotaBefore(keepDateUtc: string): void {
  for (const key of discordModeratorDailyQuota.keys()) {
    const date = key.slice(key.lastIndexOf(":") + 1);
    if (date < keepDateUtc) discordModeratorDailyQuota.delete(key);
  }
}

/** Increments today's punitive-command count for a moderator. */
export function recordModeratorDailyQuotaUse(guildId: string, staffUserId: string, nowMs: number): number {
  const date = utcQuotaDateString(nowMs);
  const key = moderatorDailyQuotaKey(guildId, staffUserId, date);
  const next = getModeratorDailyQuotaUsed(guildId, staffUserId, nowMs) + 1;
  discordModeratorDailyQuota.set(key, next);
  const yesterday = utcQuotaDateString(nowMs - 86_400_000);
  pruneModeratorQuotaBefore(yesterday);
  return next;
}

/**
 * If cooldown elapsed, updates last-post time and returns true.
 * Otherwise returns false (skip duplicate digest).
 */
export function tryConsumeCreatorSummaryCooldown(
  guildId: string,
  userId: string,
  channelId: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const key = creatorSummaryKey(guildId, userId, channelId);
  const last = discordStaffSummaryCreatorLastAt.get(key) ?? 0;
  if (nowMs - last < cooldownMs) return false;
  discordStaffSummaryCreatorLastAt.set(key, nowMs);
  return true;
}

export function getGlobalWarnCount(guildId: string, userId: string): number {
  const v = discordGlobalWarns.get(guildUserKey(guildId, userId));
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

export function incrementGlobalWarns(guildId: string, userId: string, amount = 1): number {
  const key = guildUserKey(guildId, userId);
  const next = getGlobalWarnCount(guildId, userId) + Math.max(1, Math.floor(amount));
  discordGlobalWarns.set(key, next);
  return next;
}

export function setGlobalWarnCount(guildId: string, userId: string, value: number): number {
  const key = guildUserKey(guildId, userId);
  const n = Math.max(0, Math.floor(value));
  if (n === 0) discordGlobalWarns.delete(key);
  else discordGlobalWarns.set(key, n);
  return n;
}

export function adjustGlobalWarnCount(guildId: string, userId: string, delta: number): number {
  const next = Math.max(0, getGlobalWarnCount(guildId, userId) + delta);
  return setGlobalWarnCount(guildId, userId, next);
}

export function setGlobalWarnsAtLeast(guildId: string, userId: string, minimum: number): number {
  const cur = getGlobalWarnCount(guildId, userId);
  const floor = Math.max(0, Math.floor(minimum));
  if (cur >= floor) return cur;
  return setGlobalWarnCount(guildId, userId, floor);
}

export function getMuteTier(guildId: string, userId: string): number {
  const v = discordMuteTier.get(guildUserKey(guildId, userId));
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

export function setMuteTier(guildId: string, userId: string, tier: number): number {
  const key = guildUserKey(guildId, userId);
  const n = Math.max(0, Math.floor(tier));
  if (n === 0) discordMuteTier.delete(key);
  else discordMuteTier.set(key, n);
  return n;
}

export function adjustMuteTier(guildId: string, userId: string, delta: number): number {
  const next = Math.max(0, getMuteTier(guildId, userId) + Math.floor(delta));
  return setMuteTier(guildId, userId, next);
}

/** Returns ladder index used for this mute; advances stored tier (capped at lastLadderIndex). */
export function consumeMuteTierForApply(guildId: string, userId: string, lastLadderIndex: number): number {
  const key = guildUserKey(guildId, userId);
  const cur = getMuteTier(guildId, userId);
  const idx = Math.min(cur, lastLadderIndex);
  discordMuteTier.set(key, Math.min(cur + 1, lastLadderIndex));
  return idx;
}

export function touchModerationViolation(guildId: string, userId: string, nowMs: number): void {
  discordModerationLastViolationAt.set(guildUserKey(guildId, userId), nowMs);
}

/**
 * If user had no violations for `decayMs`, reset global warns and ladder tier.
 * Returns true if decay was applied.
 */
export function applyModerationDecayIfNeeded(guildId: string, userId: string, nowMs: number, decayMs: number): boolean {
  const key = guildUserKey(guildId, userId);
  const last = discordModerationLastViolationAt.get(key);
  if (last === undefined) return false;
  if (nowMs - last < decayMs) return false;

  discordGlobalWarns.delete(key);
  discordMuteTier.delete(key);
  discordModerationLastViolationAt.delete(key);
  return true;
}

export function setDiscordRolePanel(panel: DiscordRolePanelState): void {
  discordRolePanels.set(panel.messageId, panel);
}

export function getDiscordRolePanel(messageId: string): DiscordRolePanelState | undefined {
  return discordRolePanels.get(messageId);
}

export function deleteDiscordRolePanel(messageId: string): void {
  discordRolePanels.delete(messageId);
}

export function setTempVoiceRoom(room: TempVoiceRoomState): void {
  tempVoiceRooms.set(room.voiceChannelId, room);
}

export function getTempVoiceRoom(voiceChannelId: string): TempVoiceRoomState | undefined {
  return tempVoiceRooms.get(voiceChannelId);
}

export function deleteTempVoiceRoom(voiceChannelId: string): void {
  tempVoiceRooms.delete(voiceChannelId);
}

export function findTempVoiceRoomByOwner(guildId: string, ownerId: string): TempVoiceRoomState | undefined {
  for (const room of tempVoiceRooms.values()) {
    if (room.guildId === guildId && room.ownerId === ownerId) return room;
  }
  return undefined;
}

export function setTempVoicePanel(panel: TempVoicePanelState): void {
  tempVoicePanel.set(panel.messageId, panel);
}

export function getTempVoicePanel(messageId: string): TempVoicePanelState | undefined {
  return tempVoicePanel.get(messageId);
}

export function setClanRulesPanel(panel: ClanRulesPanelState): void {
  clanRulesPanels.set(panel.messageId, panel);
}

export function getClanRulesPanel(messageId: string): ClanRulesPanelState | undefined {
  return clanRulesPanels.get(messageId);
}

export function setClanGrantRequest(req: ClanGrantRequest): void {
  clanGrantRequests.set(req.id, req);
}

export function getClanGrantRequest(id: string): ClanGrantRequest | undefined {
  return clanGrantRequests.get(id);
}

export function deleteClanGrantRequest(id: string): void {
  clanGrantRequests.delete(id);
}

export function setClanCreateRequest(req: ClanCreateRequest): void {
  clanCreateRequests.set(req.id, req);
}

export function getClanCreateRequest(id: string): ClanCreateRequest | undefined {
  return clanCreateRequests.get(id);
}

export function setClanLeaderMetaRequest(req: ClanLeaderMetaRequest): void {
  clanLeaderMetaRequests.set(req.id, req);
}

export function getClanLeaderMetaRequest(id: string): ClanLeaderMetaRequest | undefined {
  return clanLeaderMetaRequests.get(id);
}

export function deleteClanLeaderMetaRequest(id: string): void {
  clanLeaderMetaRequests.delete(id);
}

export function clanRoleEnforcementKey(guildId: string, clanRoleId: string): string {
  return `${guildId}:${clanRoleId}`;
}

export function getClanRoleEnforcement(guildId: string, clanRoleId: string): ClanRoleEnforcementState | undefined {
  return clanRoleEnforcement.get(clanRoleEnforcementKey(guildId, clanRoleId));
}

export function setClanRoleEnforcement(state: ClanRoleEnforcementState): void {
  clanRoleEnforcement.set(clanRoleEnforcementKey(state.guildId, state.clanRoleId), state);
}

export function deleteClanRoleEnforcement(guildId: string, clanRoleId: string): void {
  clanRoleEnforcement.delete(clanRoleEnforcementKey(guildId, clanRoleId));
}

export function setClanEnforcementLastRunAtMs(ms: number): void {
  clanEnforcementLastRunAtMs = ms;
}

function parseNumberMap(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const n = Math.floor(value);
    if (n < 0) continue;
    out.set(key, n);
  }
  return out;
}

export async function loadState(path: string): Promise<void> {
  try {
    const store = createStateStore(path);
    const data = await store.readState();
    if (!data) {
      if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
        const where =
          STATE_BACKEND === "upstash"
            ? "Upstash (empty key or first run)"
            : `file ${path} (missing or empty)`;
        console.log(`State load: no persisted data (${where}).`);
      }
      return;
    }
    const parsed = JSON.parse(data) as unknown;
    if (Array.isArray(parsed)) {
      // Old format: plain array of ids – no per-author info, start with empty lastSeenByAuthor
    } else if (parsed !== null && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const byAuthor = obj.lastSeenByAuthor;
      if (byAuthor !== null && typeof byAuthor === "object" && !Array.isArray(byAuthor)) {
        for (const [author, ids] of Object.entries(byAuthor)) {
          if (Array.isArray(ids)) {
            const strIds = ids.filter((x): x is string => typeof x === "string").slice(0, POSTS_PER_AUTHOR);
            if (strIds.length > 0) lastSeenByAuthor.set(author, strIds);
          }
        }
      }
      const authors = obj.authors;
      if (Array.isArray(authors)) {
        const strAuthors = authors.filter((x): x is string => typeof x === "string");
        if (strAuthors.length > 0) exboAuthors = strAuthors;
      }
      const panels = obj.discordRolePanels;
      if (panels && typeof panels === "object" && !Array.isArray(panels)) {
        for (const [messageId, value] of Object.entries(panels as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const panel = value as Record<string, unknown>;
          const guildId = typeof panel.guildId === "string" ? panel.guildId : "";
          const channelId = typeof panel.channelId === "string" ? panel.channelId : "";
          const singleRole = panel.singleRole === true;
          const buttonsRaw = Array.isArray(panel.buttons) ? panel.buttons : [];
          const buttons = buttonsRaw
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
            .map((x) => ({
              customId: typeof x.customId === "string" ? x.customId : "",
              roleId: typeof x.roleId === "string" ? x.roleId : "",
              label: typeof x.label === "string" ? x.label : "",
            }))
            .filter(
              (x) =>
                (x.customId.startsWith(ROLE_BUTTON_PREFIX) || x.customId.startsWith(ROLE_BUTTON_SINGLE_PREFIX)) &&
                x.roleId.length > 0,
            )
            .map((x) => ({
              ...x,
              label: x.label.trim().length > 0 ? x.label.trim() : "\u200b",
            }));
          if (!guildId || !channelId || buttons.length === 0) continue;
          discordRolePanels.set(messageId, { messageId, guildId, channelId, buttons, singleRole });
        }
      }

      const globalWarns = obj.discordGlobalWarns;
      if (globalWarns && typeof globalWarns === "object" && !Array.isArray(globalWarns)) {
        for (const [k, v] of parseNumberMap(globalWarns)) {
          if (v > 0) discordGlobalWarns.set(k, v);
        }
      }
      const muteTier = obj.discordMuteTier;
      if (muteTier && typeof muteTier === "object" && !Array.isArray(muteTier)) {
        for (const [k, v] of parseNumberMap(muteTier)) {
          discordMuteTier.set(k, v);
        }
      }
      const lastV = obj.discordModerationLastViolationAt;
      if (lastV && typeof lastV === "object" && !Array.isArray(lastV)) {
        for (const [k, v] of parseNumberMap(lastV)) {
          discordModerationLastViolationAt.set(k, v);
        }
      }
      const creatorSum = obj.discordStaffSummaryCreatorLastAt;
      if (creatorSum && typeof creatorSum === "object" && !Array.isArray(creatorSum)) {
        for (const [k, v] of parseNumberMap(creatorSum)) {
          discordStaffSummaryCreatorLastAt.set(k, v);
        }
      }
      const modQuota = obj.discordModeratorDailyQuota;
      if (modQuota && typeof modQuota === "object" && !Array.isArray(modQuota)) {
        for (const [k, v] of parseNumberMap(modQuota)) {
          if (v > 0) discordModeratorDailyQuota.set(k, v);
        }
      }
      loadSpamFilterFingerprintsFromState(obj.discordSpamFilterFingerprints);

      const voiceRooms = obj.tempVoiceRooms;
      if (voiceRooms && typeof voiceRooms === "object" && !Array.isArray(voiceRooms)) {
        for (const [voiceChannelId, value] of Object.entries(voiceRooms as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const ownerId = typeof row.ownerId === "string" ? row.ownerId : "";
          const createdAt = typeof row.createdAt === "number" ? row.createdAt : 0;
          if (!guildId || !ownerId || !/^\d{17,20}$/.test(voiceChannelId)) continue;
          tempVoiceRooms.set(voiceChannelId, {
            guildId,
            voiceChannelId,
            ownerId,
            textChannelId: typeof row.textChannelId === "string" ? row.textChannelId : undefined,
            locked: row.locked === true,
            userLimit: typeof row.userLimit === "number" ? row.userLimit : undefined,
            rtcRegion: row.rtcRegion === null ? null : typeof row.rtcRegion === "string" ? row.rtcRegion : undefined,
            createdAt,
          });
        }
      }
      const voicePanelRaw = obj.tempVoicePanel;
      if (voicePanelRaw && typeof voicePanelRaw === "object" && !Array.isArray(voicePanelRaw)) {
        for (const [messageId, value] of Object.entries(voicePanelRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const channelId = typeof row.channelId === "string" ? row.channelId : "";
          if (!guildId || !channelId) continue;
          tempVoicePanel.set(messageId, { guildId, channelId, messageId });
        }
      }

      const clanPanelsRaw = obj.clanRulesPanels;
      if (clanPanelsRaw && typeof clanPanelsRaw === "object" && !Array.isArray(clanPanelsRaw)) {
        for (const [messageId, value] of Object.entries(clanPanelsRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const channelId = typeof row.channelId === "string" ? row.channelId : "";
          if (!guildId || !channelId) continue;
          clanRulesPanels.set(messageId, {
            messageId,
            guildId,
            channelId,
            rulesParentMessageId:
              typeof row.rulesParentMessageId === "string" ? row.rulesParentMessageId : undefined,
          });
        }
      }

      const grantReqRaw = obj.clanGrantRequests;
      if (grantReqRaw && typeof grantReqRaw === "object" && !Array.isArray(grantReqRaw)) {
        for (const [id, value] of Object.entries(grantReqRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          if (row.status !== "pending" && row.status !== "approved" && row.status !== "denied") continue;
          const type = row.type === "grant" || row.type === "remove" ? row.type : null;
          if (!type) continue;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const channelId = typeof row.channelId === "string" ? row.channelId : "";
          const clanRoleId = typeof row.clanRoleId === "string" ? row.clanRoleId : "";
          const clanRoleName = typeof row.clanRoleName === "string" ? row.clanRoleName : "";
          const targetUserId = typeof row.targetUserId === "string" ? row.targetUserId : "";
          const requesterUserId = typeof row.requesterUserId === "string" ? row.requesterUserId : "";
          if (!guildId || !clanRoleId || !targetUserId) continue;
          clanGrantRequests.set(id, {
            id,
            guildId,
            channelId,
            threadId: typeof row.threadId === "string" ? row.threadId : undefined,
            clanRoleId,
            clanRoleName,
            targetUserId,
            requesterUserId,
            type,
            grantLeaderMeta: row.grantLeaderMeta === true,
            status: row.status,
            pendingMessageId: typeof row.pendingMessageId === "string" ? row.pendingMessageId : undefined,
            sourceMessageId: typeof row.sourceMessageId === "string" ? row.sourceMessageId : undefined,
            createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
          });
        }
      }

      const createReqRaw = obj.clanCreateRequests;
      if (createReqRaw && typeof createReqRaw === "object" && !Array.isArray(createReqRaw)) {
        for (const [id, value] of Object.entries(createReqRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          if (row.status !== "pending" && row.status !== "approved" && row.status !== "denied") continue;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const applicantId = typeof row.applicantId === "string" ? row.applicantId : "";
          const threadId = typeof row.threadId === "string" ? row.threadId : "";
          const clanName = typeof row.clanName === "string" ? row.clanName : "";
          const colorLabel = typeof row.colorLabel === "string" ? row.colorLabel : "";
          if (!guildId || !clanName) continue;
          clanCreateRequests.set(id, {
            id,
            guildId,
            applicantId,
            threadId,
            sourceMessageId: typeof row.sourceMessageId === "string" ? row.sourceMessageId : undefined,
            clanName,
            colorHex: typeof row.colorHex === "number" ? row.colorHex : 0,
            colorLabel,
            memberIds: Array.isArray(row.memberIds)
              ? row.memberIds.filter((x): x is string => typeof x === "string")
              : [],
            leaderIds: Array.isArray(row.leaderIds)
              ? row.leaderIds.filter((x): x is string => typeof x === "string")
              : [],
            status: row.status,
            reviewMessageId: typeof row.reviewMessageId === "string" ? row.reviewMessageId : undefined,
            reviewChannelId: typeof row.reviewChannelId === "string" ? row.reviewChannelId : undefined,
            createdRoleId: typeof row.createdRoleId === "string" ? row.createdRoleId : undefined,
            createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
            resolvedAt: typeof row.resolvedAt === "number" ? row.resolvedAt : undefined,
            resolvedBy: typeof row.resolvedBy === "string" ? row.resolvedBy : undefined,
            denyReason: typeof row.denyReason === "string" ? row.denyReason : undefined,
          });
        }
      }

      const leaderMetaReqRaw = obj.clanLeaderMetaRequests;
      if (leaderMetaReqRaw && typeof leaderMetaReqRaw === "object" && !Array.isArray(leaderMetaReqRaw)) {
        for (const [id, value] of Object.entries(leaderMetaReqRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          const status = row.status;
          if (
            status !== "pending_clan_leader" &&
            status !== "pending_mod" &&
            status !== "approved" &&
            status !== "denied"
          ) {
            continue;
          }
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const clanRoleId = typeof row.clanRoleId === "string" ? row.clanRoleId : "";
          const clanRoleName = typeof row.clanRoleName === "string" ? row.clanRoleName : "";
          const targetUserId = typeof row.targetUserId === "string" ? row.targetUserId : "";
          const requesterUserId = typeof row.requesterUserId === "string" ? row.requesterUserId : "";
          const threadId = typeof row.threadId === "string" ? row.threadId : "";
          const channelId = typeof row.channelId === "string" ? row.channelId : "";
          if (!guildId || !clanRoleId || !targetUserId || !threadId) continue;
          clanLeaderMetaRequests.set(id, {
            id,
            guildId,
            clanRoleId,
            clanRoleName,
            targetUserId,
            requesterUserId,
            status,
            threadId,
            channelId,
            pendingMessageId: typeof row.pendingMessageId === "string" ? row.pendingMessageId : undefined,
            sourceMessageId: typeof row.sourceMessageId === "string" ? row.sourceMessageId : undefined,
            clanLeaderApprovedBy: typeof row.clanLeaderApprovedBy === "string" ? row.clanLeaderApprovedBy : undefined,
            reviewMessageId: typeof row.reviewMessageId === "string" ? row.reviewMessageId : undefined,
            reviewChannelId: typeof row.reviewChannelId === "string" ? row.reviewChannelId : undefined,
            denyReason: typeof row.denyReason === "string" ? row.denyReason : undefined,
            createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
            resolvedAt: typeof row.resolvedAt === "number" ? row.resolvedAt : undefined,
            resolvedBy: typeof row.resolvedBy === "string" ? row.resolvedBy : undefined,
          });
        }
      }

      const enforcementRaw = obj.clanRoleEnforcement;
      if (enforcementRaw && typeof enforcementRaw === "object" && !Array.isArray(enforcementRaw)) {
        for (const [key, value] of Object.entries(enforcementRaw as Record<string, unknown>)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const row = value as Record<string, unknown>;
          const guildId = typeof row.guildId === "string" ? row.guildId : "";
          const clanRoleId = typeof row.clanRoleId === "string" ? row.clanRoleId : "";
          const clanRoleName = typeof row.clanRoleName === "string" ? row.clanRoleName : "";
          if (!guildId || !clanRoleId) continue;
          clanRoleEnforcement.set(key, {
            guildId,
            clanRoleId,
            clanRoleName,
            understaffedSinceMs:
              typeof row.understaffedSinceMs === "number" ? row.understaffedSinceMs : undefined,
            leaderlessSinceMs:
              typeof row.leaderlessSinceMs === "number" ? row.leaderlessSinceMs : undefined,
          });
        }
      }

      if (typeof obj.clanEnforcementLastRunAtMs === "number" && Number.isFinite(obj.clanEnforcementLastRunAtMs)) {
        clanEnforcementLastRunAtMs = Math.max(0, Math.floor(obj.clanEnforcementLastRunAtMs));
      }
    }
    if (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn") {
      console.log(
        `State loaded (${STATE_BACKEND}): ${exboAuthors.length} authors, ` +
          `${lastSeenByAuthor.size} lastSeen, ${discordRolePanels.size} role panels, ` +
          `${discordGlobalWarns.size} global warns, ${discordMuteTier.size} mute tiers, ` +
          `${tempVoiceRooms.size} temp voice rooms, ${clanRulesPanels.size} clan help posts, ` +
          `${clanGrantRequests.size} clan grant requests, ` +
          `${clanLeaderMetaRequests.size} clan leader-meta requests, ` +
          `${clanRoleEnforcement.size} clan enforcement records.`,
      );
    }
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      (LOG_LEVEL === "info" || LOG_LEVEL === "debug" || LOG_LEVEL === "warn")
    ) {
      console.warn("Could not load state, starting fresh:", err);
    }
  }
}

export async function saveState(path: string): Promise<boolean> {
  try {
    pruneSpamFilterFingerprintsForSave();
    const store = createStateStore(path);
    const state = {
      lastSeenByAuthor: Object.fromEntries(lastSeenByAuthor),
      authors: exboAuthors,
      discordRolePanels: Object.fromEntries(discordRolePanels),
      discordGlobalWarns: Object.fromEntries(discordGlobalWarns),
      discordMuteTier: Object.fromEntries(discordMuteTier),
      discordModerationLastViolationAt: Object.fromEntries(discordModerationLastViolationAt),
      discordStaffSummaryCreatorLastAt: Object.fromEntries(discordStaffSummaryCreatorLastAt),
      discordModeratorDailyQuota: Object.fromEntries(discordModeratorDailyQuota),
      discordSpamFilterFingerprints: serializeSpamFilterFingerprintsForState(),
      tempVoiceRooms: Object.fromEntries(tempVoiceRooms),
      tempVoicePanel: Object.fromEntries(tempVoicePanel),
      clanRulesPanels: Object.fromEntries(clanRulesPanels),
      clanGrantRequests: Object.fromEntries(clanGrantRequests),
      clanCreateRequests: Object.fromEntries(clanCreateRequests),
      clanLeaderMetaRequests: Object.fromEntries(clanLeaderMetaRequests),
      clanRoleEnforcement: Object.fromEntries(clanRoleEnforcement),
      clanEnforcementLastRunAtMs,
    };
    await store.writeState(JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to save state:", err);
    return false;
  }
}

import { ChannelType, type Guild, type TextChannel, type ThreadChannel } from "discord.js";
import {
  DISCORD_CLAN_THREAD_CLEANUP_ACTIVE_MS,
  DISCORD_CLAN_THREAD_CLEANUP_INTERVAL_MS,
  DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD,
  DISCORD_CLAN_RULES_MESSAGE_ID,
  DISCORD_MODERATION_LOG_CHANNEL_ID,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  clanRolesConfigured,
} from "../../config";
import { isDiscordModerator } from "../guildPermissions";
import {
  clanCreateRequests,
  clanGrantRequests,
  clanLeaderMetaRequests,
  clanThreadCleanupLastRunAtMs,
  saveState,
  setClanThreadCleanupLastRunAtMs,
} from "../../state";
import { resolveClanRulesThread } from "./helpers";
import { clanTxt } from "./strings";

const REMOVE_DELAY_MS = 150;

let cleanupIntervalId: ReturnType<typeof setInterval> | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectPendingUserIds(guildId: string, threadId: string): Set<string> {
  const ids = new Set<string>();
  for (const req of clanGrantRequests.values()) {
    if (req.guildId !== guildId || req.status !== "pending") continue;
    if (req.channelId !== threadId && req.threadId !== threadId) continue;
    ids.add(req.requesterUserId);
    ids.add(req.targetUserId);
  }
  for (const req of clanCreateRequests.values()) {
    if (req.guildId !== guildId || req.status !== "pending") continue;
    if (req.threadId !== threadId) continue;
    ids.add(req.applicantId);
    for (const id of req.memberIds) ids.add(id);
    for (const id of req.leaderIds) ids.add(id);
  }
  for (const req of clanLeaderMetaRequests.values()) {
    if (req.guildId !== guildId) continue;
    if (req.status !== "pending_clan_leader" && req.status !== "pending_mod") continue;
    if (req.channelId !== threadId && req.threadId !== threadId) continue;
    ids.add(req.requesterUserId);
    ids.add(req.targetUserId);
    if (req.clanLeaderApprovedBy) ids.add(req.clanLeaderApprovedBy);
  }
  return ids;
}

async function collectRecentAuthorIds(thread: ThreadChannel, sinceMs: number): Promise<Set<string>> {
  const ids = new Set<string>();
  let before: string | undefined;

  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;

    let reachedOlder = false;
    for (const msg of batch.values()) {
      if (msg.createdTimestamp >= sinceMs) {
        if (!msg.author.bot) ids.add(msg.author.id);
      } else {
        reachedOlder = true;
      }
    }

    const oldest = batch.last();
    if (!oldest || reachedOlder) break;
    before = oldest.id;
  }

  return ids;
}

async function isStaffMember(guild: Guild, userId: string): Promise<boolean> {
  const member =
    guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  return member !== null && isDiscordModerator(member);
}

async function postThreadCleanupLog(
  guild: Guild,
  threadId: string,
  before: number,
  after: number,
  removed: number,
): Promise<void> {
  if (!DISCORD_MODERATION_LOG_CHANNEL_ID) return;
  const ch = await guild.channels.fetch(DISCORD_MODERATION_LOG_CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased() || (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement)) {
    return;
  }
  await (ch as TextChannel)
    .send({
      content: clanTxt.auditThreadCleanup(threadId, before, after, removed).slice(0, 2000),
      allowedMentions: { parse: [] },
    })
    .catch((err) => console.warn("Clan thread cleanup mod log failed:", err));
}

export async function runClanThreadCleanup(guild: Guild): Promise<{ removed: number; skipped: boolean }> {
  if (!clanRolesConfigured() || !DISCORD_CLAN_RULES_MESSAGE_ID) {
    return { removed: 0, skipped: true };
  }
  if (DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD <= 0) {
    return { removed: 0, skipped: true };
  }

  const thread = await resolveClanRulesThread(guild);
  if (!thread) {
    if (LOG_LEVEL === "debug") {
      console.debug("Clan thread cleanup: rules thread not found.");
    }
    return { removed: 0, skipped: true };
  }

  const memberCount = thread.memberCount ?? 0;
  if (memberCount < DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD) {
    if (LOG_LEVEL === "debug") {
      console.debug(
        `Clan thread cleanup: ${memberCount} members (threshold ${DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD}), skipping.`,
      );
    }
    return { removed: 0, skipped: true };
  }

  if (thread.archived) {
    await thread.setArchived(false).catch(() => undefined);
    const fresh = await thread.fetch().catch(() => null);
    if (!fresh?.isThread()) return { removed: 0, skipped: true };
  }

  const botId = guild.client.user?.id;
  const pendingIds = collectPendingUserIds(guild.id, thread.id);
  const recentSince = Date.now() - DISCORD_CLAN_THREAD_CLEANUP_ACTIVE_MS;
  const recentAuthors = await collectRecentAuthorIds(thread, recentSince);

  const protectedIds = new Set<string>([...pendingIds, ...recentAuthors]);
  if (botId) protectedIds.add(botId);

  const threadMembers = await thread.members.fetch().catch(() => null);
  if (!threadMembers) {
    console.warn("Clan thread cleanup: failed to fetch thread members.");
    return { removed: 0, skipped: true };
  }

  let removed = 0;
  for (const userId of threadMembers.keys()) {
    if (protectedIds.has(userId)) continue;
    if (await isStaffMember(guild, userId)) continue;

    const removedOk = await thread.members.remove(userId).then(
      () => true,
      (err) => {
        console.warn(`Clan thread cleanup: failed to remove ${userId}:`, err);
        return false;
      },
    );
    if (removedOk) removed++;
    await sleep(REMOVE_DELAY_MS);
  }

  const refreshed = await thread.fetch().catch(() => null);
  const afterCount = refreshed?.isThread() ? (refreshed.memberCount ?? memberCount - removed) : memberCount - removed;

  await postThreadCleanupLog(guild, thread.id, memberCount, afterCount, removed);

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log(
      `Clan thread cleanup: removed ${removed} inactive member(s) from thread ${thread.id} ` +
        `(was ${memberCount}, now ${afterCount}, threshold ${DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD}).`,
    );
  }

  return { removed, skipped: false };
}

export async function runClanThreadCleanupSweep(guild: Guild): Promise<void> {
  if (!clanRolesConfigured() || DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD <= 0) return;

  const nowMs = Date.now();
  if (nowMs - clanThreadCleanupLastRunAtMs < DISCORD_CLAN_THREAD_CLEANUP_INTERVAL_MS - 60_000) {
    return;
  }

  setClanThreadCleanupLastRunAtMs(nowMs);
  await runClanThreadCleanup(guild);
  await saveState(LAST_SEEN_STATE_FILE);
}

export function startClanThreadCleanupScheduler(guild: Guild): void {
  if (!clanRolesConfigured() || DISCORD_CLAN_THREAD_CLEANUP_THRESHOLD <= 0) return;
  stopClanThreadCleanupScheduler();

  void runClanThreadCleanupSweep(guild).catch((err) => {
    console.error("Clan thread cleanup sweep failed:", err);
  });

  cleanupIntervalId = setInterval(() => {
    void runClanThreadCleanupSweep(guild).catch((err) => {
      console.error("Clan thread cleanup sweep failed:", err);
    });
  }, DISCORD_CLAN_THREAD_CLEANUP_INTERVAL_MS);
}

export function stopClanThreadCleanupScheduler(): void {
  if (cleanupIntervalId !== undefined) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = undefined;
  }
}

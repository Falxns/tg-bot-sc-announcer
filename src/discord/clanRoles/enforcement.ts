import { EmbedBuilder, type Guild, type Role } from "discord.js";
import {
  DISCORD_CLAN_ACTIVE_MIN_MEMBERS,
  DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS,
  DISCORD_CLAN_ENFORCEMENT_CHECK_MS,
  DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS,
  DISCORD_CLAN_ENFORCEMENT_GRACE_MS,
  LAST_SEEN_STATE_FILE,
  LOG_LEVEL,
  clanRolesConfigured,
} from "../../config";
import {
  clanEnforcementLastRunAtMs,
  deleteClanRoleEnforcement,
  getClanRoleEnforcement,
  pruneClanMaintenanceState,
  setClanEnforcementLastRunAtMs,
  setClanRoleEnforcement,
  saveState,
} from "../../state";
import type { ClanRoleEnforcementState } from "../types";
import { persistClanState, purgeClanRole } from "./actions";
import {
  countClanLeaders,
  countMembersWithRole,
  ensureGuildMembersCached,
  listClanLeaderIds,
  listClanRoles,
} from "./resolver";
import { clanTxt } from "./strings";

let enforcementIntervalId: ReturnType<typeof setInterval> | undefined;

function graceDeadline(fromMs: number): number {
  return fromMs + DISCORD_CLAN_ENFORCEMENT_GRACE_MS;
}

async function notifyClanLeadersDm(
  guild: Guild,
  clanRole: Role,
  content: string,
): Promise<void> {
  const leaderIds = await listClanLeaderIds(guild, clanRole.id);
  for (const userId of leaderIds) {
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    try {
      await member.send({
        embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(content.slice(0, 4096))],
      });
    } catch {
      // DMs closed — skip.
    }
  }
}

function upsertEnforcementState(
  guildId: string,
  clanRole: Role,
  patch: Partial<Pick<ClanRoleEnforcementState, "understaffedSinceMs" | "leaderlessSinceMs">>,
): ClanRoleEnforcementState {
  const existing = getClanRoleEnforcement(guildId, clanRole.id);
  const next: ClanRoleEnforcementState = {
    guildId,
    clanRoleId: clanRole.id,
    clanRoleName: clanRole.name,
    understaffedSinceMs: existing?.understaffedSinceMs,
    leaderlessSinceMs: existing?.leaderlessSinceMs,
    ...patch,
  };
  setClanRoleEnforcement(next);
  return next;
}

async function evaluateClanRole(guild: Guild, clanRole: Role, nowMs: number): Promise<boolean> {
  const memberCount = countMembersWithRole(guild, clanRole.id);
  const leaderCount = await countClanLeaders(guild, clanRole.id);
  const state = getClanRoleEnforcement(guild.id, clanRole.id);

  const understaffed = memberCount < DISCORD_CLAN_ACTIVE_MIN_MEMBERS;
  const leaderless = leaderCount === 0;

  if (!understaffed && !leaderless) {
    if (state) deleteClanRoleEnforcement(guild.id, clanRole.id);
    return false;
  }

  let enforcement = state ?? {
    guildId: guild.id,
    clanRoleId: clanRole.id,
    clanRoleName: clanRole.name,
  };

  if (understaffed) {
    if (!enforcement.understaffedSinceMs) {
      enforcement = upsertEnforcementState(guild.id, clanRole, { understaffedSinceMs: nowMs });
    }
  } else if (enforcement.understaffedSinceMs) {
    enforcement = upsertEnforcementState(guild.id, clanRole, { understaffedSinceMs: undefined });
  }

  if (leaderless) {
    if (!enforcement.leaderlessSinceMs) {
      enforcement = upsertEnforcementState(guild.id, clanRole, { leaderlessSinceMs: nowMs });
    }
  } else if (enforcement.leaderlessSinceMs) {
    enforcement = upsertEnforcementState(guild.id, clanRole, { leaderlessSinceMs: undefined });
  }

  enforcement = getClanRoleEnforcement(guild.id, clanRole.id) ?? enforcement;

  const leaderlessExpired =
    leaderless &&
    enforcement.leaderlessSinceMs !== undefined &&
    nowMs - enforcement.leaderlessSinceMs >= DISCORD_CLAN_ENFORCEMENT_GRACE_MS;

  const understaffedExpired =
    understaffed &&
    enforcement.understaffedSinceMs !== undefined &&
    nowMs - enforcement.understaffedSinceMs >= DISCORD_CLAN_ENFORCEMENT_GRACE_MS;

  if (leaderlessExpired) {
    const result = await purgeClanRole(guild, clanRole, "leaderless");
    if (result.ok) {
      deleteClanRoleEnforcement(guild.id, clanRole.id);
      return true;
    }
    console.warn(`Clan enforcement purge failed for ${clanRole.name} (leaderless): ${result.error}`);
    return false;
  }

  if (understaffedExpired) {
    const result = await purgeClanRole(guild, clanRole, "understaffed");
    if (result.ok) {
      deleteClanRoleEnforcement(guild.id, clanRole.id);
      return true;
    }
    console.warn(`Clan enforcement purge failed for ${clanRole.name} (understaffed): ${result.error}`);
    return false;
  }

  if (understaffed && leaderCount > 0 && enforcement.understaffedSinceMs !== undefined) {
    await notifyClanLeadersDm(
      guild,
      clanRole,
      clanTxt.enforcementUnderstaffedDm(
        clanRole.name,
        memberCount,
        DISCORD_CLAN_ACTIVE_MIN_MEMBERS,
        DISCORD_CLAN_ENFORCEMENT_GRACE_DAYS,
        graceDeadline(enforcement.understaffedSinceMs),
      ),
    );
  }

  return false;
}

export async function runClanEnforcementCheck(guild: Guild): Promise<void> {
  if (!clanRolesConfigured()) return;

  await ensureGuildMembersCached(guild);
  const roles = listClanRoles(guild);
  const nowMs = Date.now();

  const activeRoleIds = new Set(roles.map((r) => r.id));
  pruneClanMaintenanceState(guild.id, activeRoleIds, nowMs, DISCORD_CLAN_COLOR_CHANGE_COOLDOWN_MS);

  for (const clanRole of roles) {
    await evaluateClanRole(guild, clanRole, nowMs);
  }

  await persistClanState(LAST_SEEN_STATE_FILE);
}

export async function runClanEnforcementSweep(guild: Guild): Promise<void> {
  if (!clanRolesConfigured()) return;

  const nowMs = Date.now();
  if (nowMs - clanEnforcementLastRunAtMs < DISCORD_CLAN_ENFORCEMENT_CHECK_MS - 60_000) {
    return;
  }

  setClanEnforcementLastRunAtMs(nowMs);
  await runClanEnforcementCheck(guild);
  await saveState(LAST_SEEN_STATE_FILE);

  if (LOG_LEVEL === "info" || LOG_LEVEL === "debug") {
    console.log("Clan enforcement daily check completed.");
  }
}

export function startClanEnforcementScheduler(guild: Guild): void {
  if (!clanRolesConfigured()) return;
  stopClanEnforcementScheduler();

  void runClanEnforcementSweep(guild).catch((err) => {
    console.error("Clan enforcement sweep failed:", err);
  });

  enforcementIntervalId = setInterval(() => {
    void runClanEnforcementSweep(guild).catch((err) => {
      console.error("Clan enforcement sweep failed:", err);
    });
  }, DISCORD_CLAN_ENFORCEMENT_CHECK_MS);
}

export function stopClanEnforcementScheduler(): void {
  if (enforcementIntervalId !== undefined) {
    clearInterval(enforcementIntervalId);
    enforcementIntervalId = undefined;
  }
}

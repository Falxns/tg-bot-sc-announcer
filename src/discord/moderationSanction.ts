import type { GuildMember } from "discord.js";
import { DISCORD_WARNINGS_BEFORE_TIMEOUT } from "../config";
import {
  applyMajorLadderTimeout,
  consumeLadderTimeout,
  syncTierAfterManualMute,
  type LightPathResult,
  type MajorTimeoutResult,
} from "./moderationLadder";
import {
  getGlobalWarnCount,
  getMuteTier,
  incrementGlobalWarns,
  setGlobalWarnsAtLeast,
  setMuteTier,
} from "../state";
import { reasonPlainTextForAudit } from "./moderationReasonPresets";
import { discordAutoMod as autoTxt } from "./userStrings";

export type TimeoutApplyOutcome = "applied" | "api_error" | "not_moderatable";

export type SanctionTimeoutResult = {
  outcome: TimeoutApplyOutcome;
  timeoutMs?: number;
  tierBefore?: number;
  tierAfter?: number;
};

async function applyMemberTimeout(
  member: GuildMember,
  ms: number,
  auditReason: string,
): Promise<boolean> {
  if (!member.moderatable) return false;
  try {
    await member.timeout(ms, reasonPlainTextForAudit(auditReason));
    return true;
  } catch (err) {
    console.error("Discord moderation timeout failed:", err);
    return false;
  }
}

/** Light path: +warns; ladder timeout only when at/above threshold and API succeeds. */
export async function applyLightModerationSanction(opts: {
  guildId: string;
  userId: string;
  member: GuildMember;
  reason: string;
  warnAmount?: number;
  /** Discord audit log reason for timeout (defaults to automod minor text). */
  timeoutAuditReason?: string;
}): Promise<LightPathResult & { timeoutOutcome?: TimeoutApplyOutcome }> {
  const amount = opts.warnAmount ?? 1;
  const warnCount = incrementGlobalWarns(opts.guildId, opts.userId, amount);
  if (warnCount < DISCORD_WARNINGS_BEFORE_TIMEOUT) {
    return { warnCount, timeoutApplied: false };
  }

  const tierBefore = getMuteTier(opts.guildId, opts.userId);
  const { timeoutMs, tierUsed } = consumeLadderTimeout(opts.guildId, opts.userId);
  const applied = await applyMemberTimeout(
    opts.member,
    timeoutMs,
    opts.timeoutAuditReason ?? autoTxt.timeoutMinor(opts.reason),
  );
  if (!applied) {
    setMuteTier(opts.guildId, opts.userId, tierBefore);
    return {
      warnCount,
      timeoutApplied: false,
      timeoutOutcome: opts.member.moderatable ? "api_error" : "not_moderatable",
      tierUsed,
      tierAfter: tierBefore,
    };
  }
  return {
    warnCount,
    timeoutApplied: true,
    timeoutMs,
    tierUsed,
    tierAfter: getMuteTier(opts.guildId, opts.userId),
    timeoutOutcome: "applied",
  };
}

/** Major path: cap warns at threshold; immediate ladder timeout (floor index); tier only on success. */
export async function applyMajorModerationSanction(opts: {
  guildId: string;
  userId: string;
  member: GuildMember;
  reason: string;
}): Promise<{
  warnCount: number;
  timeout: SanctionTimeoutResult;
  plan: MajorTimeoutResult;
}> {
  const warnCount = setGlobalWarnsAtLeast(opts.guildId, opts.userId, DISCORD_WARNINGS_BEFORE_TIMEOUT);
  const tierBefore = getMuteTier(opts.guildId, opts.userId);
  const plan = applyMajorLadderTimeout(opts.guildId, opts.userId);
  const applied = await applyMemberTimeout(
    opts.member,
    plan.timeoutMs,
    autoTxt.timeoutMajor(opts.reason),
  );
  if (!applied) {
    setMuteTier(opts.guildId, opts.userId, tierBefore);
    return {
      warnCount,
      plan: { ...plan, tierAfter: tierBefore },
      timeout: {
        outcome: opts.member.moderatable ? "api_error" : "not_moderatable",
        tierBefore,
        tierAfter: tierBefore,
      },
    };
  }
  return {
    warnCount,
    plan,
    timeout: {
      outcome: "applied",
      timeoutMs: plan.timeoutMs,
      tierBefore,
      tierAfter: plan.tierAfter,
    },
  };
}

/** Manual /mute: cap warns; apply exact duration; sync tier forward on success. */
export async function applyManualMuteSanction(opts: {
  guildId: string;
  userId: string;
  member: GuildMember;
  durationMs: number;
  reason: string;
}): Promise<SanctionTimeoutResult & { warnCount: number }> {
  const tierBefore = getMuteTier(opts.guildId, opts.userId);
  const applied = await applyMemberTimeout(
    opts.member,
    opts.durationMs,
    reasonPlainTextForAudit(opts.reason),
  );
  if (!applied) {
    return {
      warnCount: getGlobalWarnCount(opts.guildId, opts.userId),
      outcome: opts.member.moderatable ? "api_error" : "not_moderatable",
      tierBefore,
      tierAfter: tierBefore,
    };
  }
  const warnCount = setGlobalWarnsAtLeast(opts.guildId, opts.userId, DISCORD_WARNINGS_BEFORE_TIMEOUT);
  const tierAfter = syncTierAfterManualMute(tierBefore, opts.durationMs);
  setMuteTier(opts.guildId, opts.userId, tierAfter);
  return {
    warnCount,
    outcome: "applied",
    timeoutMs: opts.durationMs,
    tierBefore,
    tierAfter,
  };
}

/** Staff /strike — same as light path. */
export const applyStrikeModerationSanction = applyLightModerationSanction;

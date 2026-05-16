import {
  DISCORD_MAJOR_MIN_LADDER_STEP,
  DISCORD_TIMEOUT_LADDER_MS,
  DISCORD_WARNINGS_BEFORE_TIMEOUT,
} from "../config";
import {
  consumeMuteTierForApply,
  getGlobalWarnCount,
  getMuteTier,
  incrementGlobalWarns,
  setGlobalWarnsAtLeast,
  setMuteTier,
} from "../state";

export function lastLadderIndex(): number {
  return Math.max(0, DISCORD_TIMEOUT_LADDER_MS.length - 1);
}

export function ladderDurationMs(tierIndex: number): number {
  const last = lastLadderIndex();
  const idx = Math.min(Math.max(0, tierIndex), last);
  return DISCORD_TIMEOUT_LADDER_MS[idx] ?? DISCORD_TIMEOUT_LADDER_MS[last];
}

/** Highest ladder step with duration <= ms (for manual /mute tier sync). */
export function matchedLadderIndexForDuration(durationMs: number): number {
  let matched = 0;
  for (let i = 0; i < DISCORD_TIMEOUT_LADDER_MS.length; i++) {
    if (DISCORD_TIMEOUT_LADDER_MS[i]! <= durationMs) matched = i;
  }
  return matched;
}

export function syncTierAfterManualMute(currentTier: number, durationMs: number): number {
  const last = lastLadderIndex();
  const matched = matchedLadderIndexForDuration(durationMs);
  return Math.min(Math.max(currentTier + 1, matched + 1), last);
}

export type LadderTimeoutResult = {
  timeoutMs: number;
  tierUsed: number;
  tierAfter: number;
};

/** Apply ladder[tier], then advance tier (capped). Returns indices and duration. */
export function consumeLadderTimeout(guildId: string, userId: string): LadderTimeoutResult {
  const last = lastLadderIndex();
  const tierUsed = consumeMuteTierForApply(guildId, userId, last);
  const tierAfter = getMuteTier(guildId, userId);
  return {
    timeoutMs: ladderDurationMs(tierUsed),
    tierUsed,
    tierAfter,
  };
}

export type MajorTimeoutResult = LadderTimeoutResult;

/** Major path: immediate timeout at max(currentTier, majorFloor), then advance tier. */
export function applyMajorLadderTimeout(guildId: string, userId: string): MajorTimeoutResult {
  const last = lastLadderIndex();
  const floor = Math.min(DISCORD_MAJOR_MIN_LADDER_STEP, last);
  const cur = getMuteTier(guildId, userId);
  const tierUsed = Math.min(Math.max(cur, floor), last);
  const timeoutMs = ladderDurationMs(tierUsed);
  const tierAfter = Math.min(tierUsed + 1, last);
  setMuteTier(guildId, userId, tierAfter);
  return { timeoutMs, tierUsed, tierAfter };
}

export type LightPathResult = {
  warnCount: number;
  timeoutApplied: boolean;
  timeoutMs?: number;
  tierUsed?: number;
  tierAfter?: number;
};

/** Increment global warns only (no tier change). */
export function incrementLightWarns(
  guildId: string,
  userId: string,
  warnAmount: number,
): number {
  return incrementGlobalWarns(guildId, userId, warnAmount);
}

/** Cap warns at threshold (major /mute); does not increment. */
export function capGlobalWarnsAtThreshold(guildId: string, userId: string): number {
  return setGlobalWarnsAtLeast(guildId, userId, DISCORD_WARNINGS_BEFORE_TIMEOUT);
}

export function globalWarnCount(guildId: string, userId: string): number {
  return getGlobalWarnCount(guildId, userId);
}

import {
  DISCORD_SPAM_FILTER_CHANNEL_OPTIONS,
  DISCORD_SPAM_FILTER_MAX_FINGERPRINTS_PER_SCOPE,
  resolveSpamFilterChannelOptions,
} from "../config";
import { isSpamDuplicateContentMatch } from "./spamFilterCompare";

const MAX_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type SpamFilterFingerprintEntry = {
  norm: string;
  skeleton: string;
  postedAt: number;
  authorId: string;
};

const fingerprints = new Map<string, SpamFilterFingerprintEntry[]>();

function cooldownMsForScope(scopeKey: string): number {
  const opts = resolveSpamFilterChannelOptions(scopeKey, scopeKey);
  return opts?.cooldownMs ?? MAX_COOLDOWN_MS;
}

function pruneScopeEntries(scopeKey: string, entries: SpamFilterFingerprintEntry[], nowMs: number): SpamFilterFingerprintEntry[] {
  const ttl = cooldownMsForScope(scopeKey);
  return entries.filter((e) => nowMs - e.postedAt <= ttl);
}

function capScopeEntries(entries: SpamFilterFingerprintEntry[]): SpamFilterFingerprintEntry[] {
  const max = DISCORD_SPAM_FILTER_MAX_FINGERPRINTS_PER_SCOPE;
  if (entries.length <= max) return entries;
  return entries.slice(entries.length - max);
}

/** True if norm matches any fingerprint in scope within cooldown window. */
export function hasCrossAuthorSpamDuplicate(scopeKey: string, norm: string): boolean {
  const now = Date.now();
  const entries = fingerprints.get(scopeKey);
  if (!entries || entries.length === 0) return false;

  const active = pruneScopeEntries(scopeKey, entries, now);
  if (active.length !== entries.length) {
    if (active.length === 0) fingerprints.delete(scopeKey);
    else fingerprints.set(scopeKey, active);
  }

  for (const entry of active) {
    if (isSpamDuplicateContentMatch(norm, entry.norm)) return true;
  }
  return false;
}

/** Store allowed message fingerprint (no saveState — piggybacks on other saves). */
export function recordSpamFilterFingerprint(
  scopeKey: string,
  norm: string,
  skeleton: string,
  authorId: string,
): void {
  if (norm.length === 0) return;
  const now = Date.now();
  const existing = fingerprints.get(scopeKey) ?? [];
  const pruned = capScopeEntries(pruneScopeEntries(scopeKey, existing, now));
  pruned.push({ norm, skeleton, postedAt: now, authorId });
  fingerprints.set(scopeKey, capScopeEntries(pruned));
}

/** Drop expired fingerprints before serializing state. */
export function pruneSpamFilterFingerprintsForSave(nowMs = Date.now()): void {
  for (const [scopeKey, entries] of fingerprints) {
    const pruned = pruneScopeEntries(scopeKey, entries, nowMs);
    if (pruned.length === 0) fingerprints.delete(scopeKey);
    else fingerprints.set(scopeKey, capScopeEntries(pruned));
  }
  for (const scopeKey of [...fingerprints.keys()]) {
    if (DISCORD_SPAM_FILTER_CHANNEL_OPTIONS[scopeKey]) continue;
    const entries = fingerprints.get(scopeKey);
    if (!entries) continue;
    const pruned = entries.filter((e) => nowMs - e.postedAt <= MAX_COOLDOWN_MS);
    if (pruned.length === 0) fingerprints.delete(scopeKey);
    else fingerprints.set(scopeKey, pruned);
  }
}

export function serializeSpamFilterFingerprintsForState(): Record<string, SpamFilterFingerprintEntry[]> {
  return Object.fromEntries(fingerprints);
}

export function loadSpamFilterFingerprintsFromState(raw: unknown): void {
  fingerprints.clear();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  for (const [scopeKey, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const entries: SpamFilterFingerprintEntry[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const norm = typeof row.norm === "string" ? row.norm : "";
      const skeleton = typeof row.skeleton === "string" ? row.skeleton : "";
      const postedAt = typeof row.postedAt === "number" && Number.isFinite(row.postedAt) ? row.postedAt : 0;
      const authorId = typeof row.authorId === "string" ? row.authorId : "";
      if (!norm || !postedAt) continue;
      entries.push({
        norm: norm.slice(0, 1000),
        skeleton: skeleton.slice(0, 1000),
        postedAt,
        authorId,
      });
    }
    if (entries.length > 0) fingerprints.set(scopeKey, entries);
  }
}

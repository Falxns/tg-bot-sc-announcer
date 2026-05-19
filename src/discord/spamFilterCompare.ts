/** Shared normalize + duplicate match for spam filter (consecutive and cross-author cooldown). */

const SPAM_NORMALIZE_MAX_LEN = 1000;
const SPAM_HYBRID_MAX_LEN_DELTA = 8;
const SPAM_SKELETON_MIN_LEN = 4;
const SPAM_FUZZY_LONG_MIN_LEN = 40;
const SPAM_FUZZY_MIN_RATIO = 0.92;

function stripSpamEdgeNonCore(s: string): string {
  let t = s;
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
  }
  return t;
}

export function normalizeMessageForSpamCompare(raw: string): string {
  let s = raw.normalize("NFKC");
  s = s.replace(/[\u200B-\u200D\uFEFF\u2060-\u206F]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.toLowerCase();
  s = stripSpamEdgeNonCore(s);
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > SPAM_NORMALIZE_MAX_LEN) s = s.slice(0, SPAM_NORMALIZE_MAX_LEN);
  return s;
}

export function spamSkeleton(normalized: string): string {
  return normalized.replace(/[^\p{L}\p{N}]+/gu, "");
}

function spamNormLengthsClose(a: string, b: string): boolean {
  return Math.abs(a.length - b.length) <= SPAM_HYBRID_MAX_LEN_DELTA;
}

function levenshteinDistance(s: string, t: string): number {
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const v0 = new Array<number>(n + 1);
  const v1 = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) v0[j] = j;
  for (let i = 0; i < m; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < n; j++) {
      const cost = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= n; j++) v0[j] = v1[j];
  }
  return v0[n];
}

function spamNormalizedLevenshteinSimilarity(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return 1;
  if (m === 0 || n === 0) return 0;
  const maxLen = Math.max(m, n);
  const maxDistForRatio = Math.ceil((1 - SPAM_FUZZY_MIN_RATIO) * maxLen);
  if (Math.abs(m - n) > maxDistForRatio) return 0;
  const d = levenshteinDistance(a, b);
  return 1 - d / maxLen;
}

export function isSpamDuplicateContentMatch(norm: string, normPrev: string): boolean {
  if (norm === normPrev) return true;

  const sk = spamSkeleton(norm);
  const skPrev = spamSkeleton(normPrev);
  if (
    sk.length >= SPAM_SKELETON_MIN_LEN &&
    skPrev.length >= SPAM_SKELETON_MIN_LEN &&
    sk === skPrev &&
    spamNormLengthsClose(norm, normPrev)
  ) {
    return true;
  }

  if (Math.min(norm.length, normPrev.length) > SPAM_FUZZY_LONG_MIN_LEN) {
    if (spamNormalizedLevenshteinSimilarity(norm, normPrev) >= SPAM_FUZZY_MIN_RATIO) return true;
  }

  return false;
}

export function buildSpamFingerprint(raw: string): { norm: string; skeleton: string } {
  const norm = normalizeMessageForSpamCompare(raw);
  return { norm, skeleton: spamSkeleton(norm) };
}

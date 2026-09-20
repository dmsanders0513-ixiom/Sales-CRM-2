/**
 * Deduplication engine. Pure functions — no DB access here so it stays
 * easy to unit test. API routes call these to flag potential duplicates;
 * nothing here ever deletes a record. Merge/keep-both/dismiss are always
 * explicit user actions performed by the API route, never silent.
 */

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pty|ltd|inc|llc|corp|corporation|limited|proprietary)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  // strip everything but digits, drop a leading country/trunk pattern
  const digits = phone.replace(/\D/g, "");
  return digits.replace(/^27/, "0").replace(/^0*/, "0");
}

export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").toLowerCase().trim();
}

/** Levenshtein-based similarity, 0..1, used as a fallback for fuzzy name matches. */
export function nameSimilarity(a: string, b: string): number {
  const s1 = normalizeCompanyName(a);
  const s2 = normalizeCompanyName(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const dist = levenshtein(s1, s2);
  return 1 - dist / Math.max(s1.length, s2.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface DedupeRecord {
  id: string;
  company_name: string;
  website?: string | null;
  telephone?: string | null;
  general_email?: string | null;
  decision_maker_email?: string | null;
}

export interface DedupeMatch {
  recordA: string;
  recordB: string;
  reason: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

/** Compare one candidate record against a list of existing records. */
export function findPotentialDuplicates(candidate: DedupeRecord, existing: DedupeRecord[]): DedupeMatch[] {
  const matches: DedupeMatch[] = [];
  const candWebsite = normalizeUrl(candidate.website);
  const candPhone = normalizePhone(candidate.telephone);
  const candEmails = [normalizeEmail(candidate.general_email), normalizeEmail(candidate.decision_maker_email)].filter(Boolean);

  for (const existingRecord of existing) {
    if (existingRecord.id === candidate.id) continue;

    if (candWebsite && candWebsite === normalizeUrl(existingRecord.website)) {
      matches.push({ recordA: candidate.id, recordB: existingRecord.id, reason: "Same website", confidence: "HIGH" });
      continue;
    }
    if (candPhone && candPhone === normalizePhone(existingRecord.telephone)) {
      matches.push({ recordA: candidate.id, recordB: existingRecord.id, reason: "Same phone number", confidence: "HIGH" });
      continue;
    }
    const existingEmails = [normalizeEmail(existingRecord.general_email), normalizeEmail(existingRecord.decision_maker_email)].filter(Boolean);
    if (candEmails.some((e) => existingEmails.includes(e))) {
      matches.push({ recordA: candidate.id, recordB: existingRecord.id, reason: "Same email address", confidence: "HIGH" });
      continue;
    }
    const sim = nameSimilarity(candidate.company_name, existingRecord.company_name);
    if (sim >= 0.9) {
      matches.push({ recordA: candidate.id, recordB: existingRecord.id, reason: `Company name ${Math.round(sim * 100)}% similar`, confidence: "MEDIUM" });
    } else if (sim >= 0.75) {
      matches.push({ recordA: candidate.id, recordB: existingRecord.id, reason: `Company name ${Math.round(sim * 100)}% similar`, confidence: "LOW" });
    }
  }
  return matches;
}

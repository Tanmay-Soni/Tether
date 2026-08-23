import type { Candidate } from "../types.js";

export function assignConfidence(candidate: Candidate): Candidate {
  const hasAst = candidate.evidence.some(
    (evidence) => evidence.source === "deterministic-ast",
  );
  const hasRg = candidate.evidence.some(
    (evidence) => evidence.source === "deterministic-rg",
  );
  const hasKb = candidate.evidence.some(
    (evidence) => evidence.source === "greptile-kb",
  );

  if (candidate.confirmation === "rejected") {
    return { ...candidate, confidence: 0.1 };
  }
  if (hasAst && candidate.confirmation === "confirmed") {
    return { ...candidate, confidence: 1 };
  }
  if (hasRg && candidate.confirmation === "confirmed") {
    return { ...candidate, confidence: 0.9 };
  }
  if (hasKb && hasRg) {
    return { ...candidate, confirmation: "possible", confidence: 0.7 };
  }
  if (hasKb) {
    return { ...candidate, confirmation: "possible", confidence: 0.45 };
  }
  return { ...candidate, confidence: Math.min(candidate.confidence, 0.7) };
}

export function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.path}:${candidate.lineStart}:${candidate.symbol ?? ""}:${candidate.whyAffected}`;
    const existing = byKey.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      byKey.set(key, candidate);
    } else {
      existing.evidence.push(...candidate.evidence);
    }
  }
  return [...byKey.values()]
    .map(assignConfidence)
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.lineStart - right.lineStart ||
        (left.symbol ?? "").localeCompare(right.symbol ?? ""),
    );
}

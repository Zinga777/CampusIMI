/**
 * Time-decayed trending score. Computed in application code (not SQL) over a bounded
 * recent window so a decade-old high-like post can never dominate, and so the formula
 * doesn't depend on SQLite math-function availability across D1 versions.
 *
 *   raw_score = likes*2 + comments*4 + reactions*1
 *   decay     = 1 / (1 + hours_old/12)^1.5      (gravity-style decay, ~half-life ~12-18h)
 *   score     = raw_score * decay
 */
export interface TrendableCounts {
  likeCount: number;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
}

export function trendingScore(counts: TrendableCounts, now: Date = new Date()): number {
  const hoursOld = Math.max(0, (now.getTime() - new Date(counts.createdAt).getTime()) / 3_600_000);
  const rawScore = counts.likeCount * 2 + counts.commentCount * 4 + counts.reactionCount * 1;
  const base = 1 + hoursOld / 12;
  const decay = 1 / (base * Math.sqrt(base)); // base^1.5 without a pow() dependency
  return rawScore * decay;
}

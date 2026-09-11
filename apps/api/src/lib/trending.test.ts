import { describe, expect, it } from "vitest";
import { trendingScore } from "./trending.js";

describe("trendingScore", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("gives a brand-new post with engagement a positive score", () => {
    const score = trendingScore(
      { likeCount: 5, commentCount: 2, reactionCount: 1, createdAt: now.toISOString() },
      now,
    );
    expect(score).toBeGreaterThan(0);
  });

  it("gives a post with zero engagement a score of zero", () => {
    const score = trendingScore(
      { likeCount: 0, commentCount: 0, reactionCount: 0, createdAt: now.toISOString() },
      now,
    );
    expect(score).toBe(0);
  });

  it("decays a post's score as it ages", () => {
    const fresh = trendingScore(
      { likeCount: 10, commentCount: 5, reactionCount: 2, createdAt: now.toISOString() },
      now,
    );
    const oneDayOld = trendingScore(
      { likeCount: 10, commentCount: 5, reactionCount: 2, createdAt: new Date(now.getTime() - 24 * 3_600_000).toISOString() },
      now,
    );
    expect(oneDayOld).toBeLessThan(fresh);
  });

  it("lets a recent post with modest engagement outrank an old post with raw likes alone", () => {
    // A week-old post with lots of raw likes but no discussion...
    const oldButLiked = trendingScore(
      { likeCount: 50, commentCount: 0, reactionCount: 0, createdAt: new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString() },
      now,
    );
    // ...vs. a 1-hour-old post that's actively being discussed.
    const newAndDiscussed = trendingScore(
      { likeCount: 5, commentCount: 8, reactionCount: 3, createdAt: new Date(now.getTime() - 3_600_000).toISOString() },
      now,
    );
    expect(newAndDiscussed).toBeGreaterThan(oldButLiked);
  });

  it("weights comments more heavily than likes, and likes more than reactions", () => {
    const commentHeavy = trendingScore({ likeCount: 0, commentCount: 1, reactionCount: 0, createdAt: now.toISOString() }, now);
    const likeHeavy = trendingScore({ likeCount: 1, commentCount: 0, reactionCount: 0, createdAt: now.toISOString() }, now);
    const reactionHeavy = trendingScore({ likeCount: 0, commentCount: 0, reactionCount: 1, createdAt: now.toISOString() }, now);
    expect(commentHeavy).toBeGreaterThan(likeHeavy);
    expect(likeHeavy).toBeGreaterThan(reactionHeavy);
  });
});

import { buildDisplayName, DISPLAY_NAME_ADJECTIVES, DISPLAY_NAME_NOUNS, RESERVED_DISPLAY_NAMES } from "@campusimi/shared";
import type { Env } from "../types.js";

const MAX_ATTEMPTS = 30;

function randomIndex(max: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % max;
}

function isReserved(name: string): boolean {
  return RESERVED_DISPLAY_NAMES.includes(name.toLowerCase());
}

/** Generates a unique, non-reserved anonymous display name, retrying on collision. */
export async function generateUniqueDisplayName(db: Env["DB"]): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const adjIndex = randomIndex(DISPLAY_NAME_ADJECTIVES.length);
    const nounIndex = randomIndex(DISPLAY_NAME_NOUNS.length);
    // First few attempts try without a numeric suffix for cleaner names; fall back to
    // a suffix once the short namespace starts colliding (fine at ~500 users either way).
    const suffix = attempt < 8 ? undefined : randomIndex(9000) + 1000;
    const candidate = buildDisplayName(adjIndex, nounIndex, suffix);

    if (isReserved(candidate)) continue;

    const existing = await db
      .prepare(`SELECT 1 FROM anonymous_profiles WHERE display_name = ?1`)
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }

  // Extremely unlikely at ~500 users; guarantee uniqueness with a random suffix.
  return buildDisplayName(randomIndex(DISPLAY_NAME_ADJECTIVES.length), randomIndex(DISPLAY_NAME_NOUNS.length), Date.now() % 100000);
}

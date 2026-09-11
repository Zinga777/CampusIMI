/** Word lists used to generate anonymous display names like "MidnightOwl".
 * Kept deliberately generic/neutral — no identity-revealing or offensive terms. */

export const DISPLAY_NAME_ADJECTIVES = [
  "Midnight", "Quiet", "Sunny", "Cosmic", "Hidden", "Wandering", "Lazy", "Curious",
  "Bright", "Silent", "Golden", "Electric", "Velvet", "Rusty", "Frosty", "Gentle",
  "Rowdy", "Sleepy", "Witty", "Nimble", "Stormy", "Mellow", "Spicy", "Chill",
  "Vivid", "Dusty", "Lucky", "Brave", "Cheeky", "Dreamy",
] as const;

export const DISPLAY_NAME_NOUNS = [
  "Owl", "Fox", "Panda", "Falcon", "Otter", "Wolf", "Sparrow", "Tiger",
  "Comet", "Nebula", "Pineapple", "Penguin", "Cactus", "Raven", "Lynx", "Koala",
  "Dolphin", "Badger", "Hedgehog", "Gecko", "Maple", "Willow", "Ember", "Pixel",
  "Voyager", "Nomad", "Scholar", "Rebel", "Wanderer", "Sprout",
] as const;

/** Deterministic candidate generator given two random indices + a numeric suffix. */
export function buildDisplayName(adjIndex: number, nounIndex: number, suffix?: number): string {
  const adj = DISPLAY_NAME_ADJECTIVES[adjIndex % DISPLAY_NAME_ADJECTIVES.length];
  const noun = DISPLAY_NAME_NOUNS[nounIndex % DISPLAY_NAME_NOUNS.length];
  return suffix === undefined ? `${adj}${noun}` : `${adj}${noun}${suffix}`;
}

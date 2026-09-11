const PALETTE = ["#4d68ab", "#f2a53c", "#3a4f8a", "#dc8c22", "#7089c6", "#26304e"];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic, offline placeholder avatar (no network/asset dependency) based on the
 * anonymous display name — used until/unless a student uploads a custom avatar. */
export function fallbackAvatarDataUri(seed: string): string {
  const hash = hashString(seed);
  const color = PALETTE[hash % PALETTE.length];
  const initials = seed.replace(/[^A-Z0-9]/g, "").slice(0, 2) || seed.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="32" fill="${color}"/>
    <text x="32" y="40" font-family="system-ui,sans-serif" font-size="24" fill="white" text-anchor="middle">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

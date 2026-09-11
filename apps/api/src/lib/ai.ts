import type { Env } from "../types.js";

/**
 * Thin AI abstraction. When AI_API_KEY / AI_PROVIDER isn't configured (the default for
 * local dev, since no real credentials are available in this environment), every call
 * falls back to a deterministic template generator so the feature is still fully
 * testable offline. When a real key is configured, the same call shape routes to an
 * OpenAI-compatible chat completion endpoint instead — callers never need to know
 * which path served the request.
 *
 * Every function here is given only the minimum context it needs (interests, public
 * bio text, recent message text) — never email, password, student id, internal user
 * id, or precise location. Output is always a *suggestion*: callers must show it to
 * the user for explicit approval before it's published or sent anywhere.
 */

async function complete(env: Env, systemPrompt: string, userPrompt: string, fallback: () => string[]): Promise<string[]> {
  if (!env.AI_API_KEY || env.AI_PROVIDER === "none") {
    return fallback();
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        n: 1,
        max_tokens: 200,
      }),
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? [text] : fallback();
  } catch {
    return fallback();
  }
}

export async function suggestBio(env: Env, interests: string[], course: string | null): Promise<string[]> {
  const fallback = () => {
    const tag = interests[0] ? ` into ${interests[0]}` : "";
    const courseTag = course ? ` studying ${course}` : "";
    return [
      `Just here for the campus chaos${tag}${courseTag}.`,
      `Anonymous by name, chaotic by nature${tag ? ` — also${tag}` : ""}.`,
      `Probably in the library${courseTag ? ` (${courseTag.trim()})` : ""}. Say hi anonymously.`,
    ];
  };
  return complete(
    env,
    "You write short, casual, first-person student bio one-liners (under 100 characters). Return only the bio text.",
    `Interests: ${interests.join(", ") || "unspecified"}. Course: ${course ?? "unspecified"}.`,
    fallback,
  );
}

export async function rewritePost(env: Env, content: string): Promise<string[]> {
  const trimmed = content.trim();
  const fallback = () => {
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const withPunctuation = /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    return [
      withPunctuation,
      `${withPunctuation} 👀`,
      capitalized.replace(/\s+/g, " ").replace(/!+$/, "!"),
    ].filter((v, i, arr) => arr.indexOf(v) === i);
  };
  return complete(
    env,
    "You lightly polish anonymous campus social posts — same meaning, better flow, casual tone, no added claims. Return only the rewritten post.",
    trimmed,
    fallback,
  );
}

export async function suggestConversationStarters(env: Env, sharedInterests: string[]): Promise<string[]> {
  const fallback = () => {
    const base = [
      "What's the best thing that's happened to you on campus this week?",
      "Coffee or chai — and where's your go-to spot?",
      "What's a class you'd recommend to literally anyone?",
    ];
    if (sharedInterests.length > 0) {
      base.unshift(`I saw you're into ${sharedInterests[0]} too — how'd you get into that?`);
    }
    return base;
  };
  return complete(
    env,
    "You write friendly, low-pressure anonymous chat conversation starters for two students who just matched. Return 3, one per line.",
    `Shared interests: ${sharedInterests.join(", ") || "none listed"}.`,
    () => fallback(),
  );
}

const DATE_IDEAS = [
  { activity: "coffee", idea: "Grab coffee at the campus café between classes — low pressure, 30 minutes tops." },
  { activity: "food", idea: "Try that food truck/stall everyone keeps talking about." },
  { activity: "movie", idea: "Catch a movie night on or off campus." },
  { activity: "campus walk", idea: "Take a walk around campus at golden hour." },
  { activity: "gaming", idea: "Co-op game session — low-stakes, easy to talk during." },
  { activity: "college event", idea: "Check out the next campus event together." },
  { activity: "study date", idea: "Study together at the library, then grab a snack after." },
];

export async function suggestDatePlans(env: Env, sharedInterests: string[]): Promise<string[]> {
  const fallback = () => DATE_IDEAS.map((d) => d.idea);
  return complete(
    env,
    "You suggest 3 casual, low-pressure first-meetup ideas for two college students who matched anonymously. Return 3, one per line.",
    `Shared interests: ${sharedInterests.join(", ") || "none listed"}.`,
    fallback,
  );
}

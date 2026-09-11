/**
 * Layer-1 automatic moderation: server-side pattern checks applied at submission time
 * to posts, comments, and bios. This is advisory/blocking for hard PII, never the final
 * moderation authority (that's the human admin layer, Phase 4). A fuller banned-word
 * list, accusation heuristics, and AI advisory tagging land in Phase 4; this module
 * ships the sensitive-info detector early since bios need it in Phase 2.
 */

export interface ModerationResult {
  blocked: boolean;
  reason?: string;
}

// Phone numbers: sequences of 7+ digits, allowing common separators.
const PHONE_RE = /(?:\+?\d[\d\-.\s]{6,}\d)/;
// Emails.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// Common address hints: a number followed by a street-ish word.
const ADDRESS_RE = /\b\d{1,5}\s+([A-Za-z]+\s){0,3}(street|st\.?|avenue|ave\.?|road|rd\.?|lane|ln\.?|block|hostel|apartment|apt\.?)\b/i;
// Student ID-ish patterns: "roll no"/"student id"/"reg no" *actually followed by a
// value* (an explicit separator), not just mentioned in conversation — e.g. "student
// id: 12345678" blocks, but "what's the student id format?" does not.
const STUDENT_ID_RE = /\b(roll\s*no\.?|student\s*id|reg\.?\s*no\.?)\s*[:=]\s*\w{4,}/i;
// Password-ish sharing — same reasoning: require an explicit "key: value" or
// "key=value" separator so "I forgot my password today" doesn't get blocked, while
// "password: hunter2" or "otp=583920" still does.
const PASSWORD_RE = /\b(password|passcode|otp)\s*[:=]\s*\S{3,}/i;

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/** Blocks submission when the content contains clear personal/contact information. */
export function detectSensitiveInfo(text: string): ModerationResult {
  if (EMAIL_RE.test(text)) {
    return { blocked: true, reason: "This post appears to contain an email address." };
  }
  if (PASSWORD_RE.test(text)) {
    return { blocked: true, reason: "This post appears to contain a password or OTP." };
  }
  if (STUDENT_ID_RE.test(text)) {
    return { blocked: true, reason: "This post appears to contain a student ID." };
  }
  if (ADDRESS_RE.test(text)) {
    return { blocked: true, reason: "This post appears to contain a physical address." };
  }
  const phoneMatch = text.match(PHONE_RE);
  if (phoneMatch && digitCount(phoneMatch[0]) >= 7) {
    return { blocked: true, reason: "This post appears to contain a phone number." };
  }
  return { blocked: false };
}

// Links: explicit protocol/www, or a bare "word.tld" token (optionally followed by a
// path) using a curated list of common TLDs — broad enough to catch "check this out
// instagram.com/x" without flagging ordinary sentences that happen to contain a dot.
const LINK_RE =
  /\b((https?:\/\/|www\.)\S+|[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|co|edu|in|me|ly|gg|xyz|app|dev|info|link|biz|gov|us|uk)\b(\/\S*)?)/i;

/**
 * Blocks any link/URL in regular post or comment text. Links (and images/posters) can
 * only reach the public feed through the admin-approved post-request queue — see
 * `routes/post-requests.ts`. This keeps plain text free-for-all while gating anything
 * clickable behind a human review.
 */
export function detectLink(text: string): ModerationResult {
  if (LINK_RE.test(text)) {
    return {
      blocked: true,
      reason:
        "Links aren't allowed in regular posts or comments. To share a link, poster, or event, submit a request for admin approval instead.",
    };
  }
  return { blocked: false };
}

// Soft accusation heuristic: verbs implying wrongdoing directed at a specific,
// identifiable person (a proper-noun-ish capitalized token, or "he/she/they said").
// This is a nudge, not a block — full accusation/gossip handling ships in Phase 4.
const ACCUSATION_RE = /\b(stole|cheated|cheating|scammed|assaulted|harassed|raped|lied about|is a (thief|cheater|liar|scammer))\b/i;

export function detectUnverifiedAccusation(text: string): ModerationResult {
  if (ACCUSATION_RE.test(text)) {
    return {
      blocked: false,
      reason:
        "Please avoid posting unverified accusations or private information about other students.",
    };
  }
  return { blocked: false };
}

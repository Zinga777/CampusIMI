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
// Student ID-ish patterns: "id" or "roll" followed by digits.
const STUDENT_ID_RE = /\b(roll\s*no\.?|student\s*id|reg\.?\s*no\.?)\s*[:-]?\s*\w{4,}/i;
// Password-ish sharing.
const PASSWORD_RE = /\b(password|passcode|otp)\s*[:-]?\s*\S{4,}/i;

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

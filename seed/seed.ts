#!/usr/bin/env node
/**
 * DEV-ONLY seed data generator. Never use real student information here.
 *
 * Generates a SQL file with fake students, profiles, posts, comments, likes,
 * confessions, a couple of matches/conversations/messages, and events, then applies
 * it to the local emulated D1 database via `wrangler d1 execute --local`.
 *
 * Run from apps/api (where wrangler.toml lives): `npm run seed:local`.
 */
import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PBKDF2_ITERATIONS = 210_000;
const SEED_PASSWORD = "password123"; // dev-only, documented, never a real credential

const ADJECTIVES = [
  "Midnight", "Quiet", "Sunny", "Cosmic", "Hidden", "Wandering", "Lazy", "Curious",
  "Bright", "Silent", "Golden", "Electric", "Velvet", "Rusty", "Frosty", "Gentle",
  "Rowdy", "Sleepy", "Witty", "Nimble", "Stormy", "Mellow", "Spicy", "Chill",
  "Vivid", "Dusty", "Lucky", "Brave", "Cheeky", "Dreamy",
];
const NOUNS = [
  "Owl", "Fox", "Panda", "Falcon", "Otter", "Wolf", "Sparrow", "Tiger",
  "Comet", "Nebula", "Pineapple", "Penguin", "Cactus", "Raven", "Lynx", "Koala",
  "Dolphin", "Badger", "Hedgehog", "Gecko", "Maple", "Willow", "Ember", "Pixel",
  "Voyager", "Nomad", "Scholar", "Rebel", "Wanderer", "Sprout",
];

const DOMAINS = ["cse.college.edu", "ece.college.edu", "college.edu"];
const ACADEMIC_STATUSES = ["junior", "senior"];
const GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"];
const COURSES = ["Computer Science", "Electrical Engineering", "Mechanical Engineering", "Economics", "Psychology", "Biology", "Business", null, null];
const INTEREST_POOL = ["hiking", "coding", "music", "gaming", "reading", "basketball", "photography", "cooking", "chess", "anime", "film", "yoga", "debate", "robotics", "art"];
const CATEGORIES = ["confession", "gossip", "campus", "rant", "question", "fun", "crush", "achievement", "event", "other"];
const REACTIONS = ["haha", "wow", "sad", "fire", "clap"];

const POST_TEMPLATES = [
  "Whoever keeps taking my seat in the library... we need to talk.",
  "The food at the canteen today was actually good for once.",
  "Confession: I've had a crush on someone from our class for months.",
  "PSA: the printer on the 2nd floor is working again!",
  "Does anyone else think the WiFi in the dorms is unbearably slow?",
  "Just aced my midterm and I'm still in shock.",
  "Rant: group projects where one person does all the work need to stop.",
  "Anyone else pulling an all-nighter in the library right now?",
  "The squirrels on campus are getting way too bold.",
  "Shoutout to whoever left their notes in the study room, you saved my grade.",
  "Is it just me or did the cafeteria raise prices again?",
  "Looking for study buddies for the upcoming finals!",
  "Saw the cutest dog on campus today, campus needs more dogs.",
  "Why is registration always the most stressful week of the semester.",
  "The sunset from the quad today was unreal.",
  "Confession: I still haven't started the assignment due tomorrow.",
  "Gossip: apparently two TAs are secretly dating.",
  "Question: best place on campus to nap between classes?",
  "Achievement unlocked: finally understood recursion.",
  "Anyone going to the game this weekend?",
];

const COMMENT_TEMPLATES = [
  "Same, honestly.",
  "This is so real.",
  "LOL I felt this in my soul.",
  "Wait really? tell me more",
  "Same energy today.",
  "I was just thinking about this!",
  "No because this happened to me too 💀",
  "Facts.",
  "Ok but why is this so accurate",
  "I needed to hear this today.",
];

function sqlStr(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickSome<T>(arr: T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000 - Math.random() * 86_400_000);
  return d.toISOString();
}

function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000 + Math.random() * 86_400_000);
  return d.toISOString();
}

const STUDENT_COUNT = 40;
const POST_COUNT = 100;
const COMMENT_COUNT = 150;

const passwordHash = hashPassword(SEED_PASSWORD);
const lines: string[] = [];
lines.push("-- DEV-ONLY seed data. Never use real student information.");
lines.push("PRAGMA foreign_keys = OFF;");

interface Student {
  userId: string;
  profileId: string;
  displayName: string;
  email: string;
}

const students: Student[] = [];
const usedNames = new Set<string>();

for (let i = 0; i < STUDENT_COUNT; i++) {
  const userId = randomUUID();
  const profileId = randomUUID();
  const email = `student${i + 1}@${pick(DOMAINS)}`;

  let displayName = "";
  do {
    displayName = `${pick(ADJECTIVES)}${pick(NOUNS)}${usedNames.size > ADJECTIVES.length * NOUNS.length * 0.6 ? Math.floor(Math.random() * 9000) + 1000 : ""}`;
  } while (usedNames.has(displayName.toLowerCase()));
  usedNames.add(displayName.toLowerCase());

  const academicStatus = pick(ACADEMIC_STATUSES);
  const gender = pick(GENDERS);
  const course = pick(COURSES);
  const interests = pickSome(INTEREST_POOL, 0, 4);
  const bio = Math.random() > 0.3 ? `Just here for the campus chaos${interests[0] ? ` — into ${interests[0]}` : ""}.` : null;
  const createdAt = isoDaysAgo(60);

  lines.push(
    `INSERT INTO users (id, email, password_hash, is_verified, account_status, created_at, updated_at, last_active_at) VALUES (${sqlStr(userId)}, ${sqlStr(email)}, ${sqlStr(passwordHash)}, 1, 'active', ${sqlStr(createdAt)}, ${sqlStr(createdAt)}, ${sqlStr(isoDaysAgo(1))});`,
  );
  lines.push(
    `INSERT INTO anonymous_profiles (id, user_id, display_name, bio, academic_status, gender, course, interests, created_at, updated_at) VALUES (${sqlStr(profileId)}, ${sqlStr(userId)}, ${sqlStr(displayName)}, ${sqlStr(bio)}, ${sqlStr(academicStatus)}, ${sqlStr(gender)}, ${sqlStr(course)}, ${sqlStr(JSON.stringify(interests))}, ${sqlStr(createdAt)}, ${sqlStr(createdAt)});`,
  );

  students.push({ userId, profileId, displayName, email });
}

interface Post {
  id: string;
  authorIndex: number;
}
const posts: Post[] = [];

for (let i = 0; i < POST_COUNT; i++) {
  const id = randomUUID();
  const authorIndex = Math.floor(Math.random() * students.length);
  const author = students[authorIndex]!;
  const content = pick(POST_TEMPLATES);
  const category = Math.random() > 0.15 ? pick(CATEGORIES) : null;
  const createdAt = isoDaysAgo(14);

  lines.push(
    `INSERT INTO posts (id, author_user_id, anonymous_profile_id, content, category, status, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(author.userId)}, ${sqlStr(author.profileId)}, ${sqlStr(content)}, ${sqlStr(category)}, 'published', ${sqlStr(createdAt)}, ${sqlStr(createdAt)});`,
  );
  posts.push({ id, authorIndex });
}

// Likes, reactions
const postLikeCounts = new Map<string, number>();
const postReactionCounts = new Map<string, number>();

for (const post of posts) {
  const likers = pickSome(students, 0, Math.min(15, students.length));
  const likerIds = new Set<string>();
  for (const liker of likers) {
    if (likerIds.has(liker.userId)) continue;
    likerIds.add(liker.userId);
    lines.push(`INSERT INTO post_likes (id, post_id, user_id, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(post.id)}, ${sqlStr(liker.userId)}, ${sqlStr(isoDaysAgo(5))});`);
  }
  postLikeCounts.set(post.id, likerIds.size);

  const reactors = pickSome(students, 0, 6);
  const reactorIds = new Set<string>();
  for (const reactor of reactors) {
    if (reactorIds.has(reactor.userId) || likerIds.has(reactor.userId)) continue;
    reactorIds.add(reactor.userId);
    lines.push(`INSERT INTO post_reactions (id, post_id, user_id, reaction_type, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(post.id)}, ${sqlStr(reactor.userId)}, ${sqlStr(pick(REACTIONS))}, ${sqlStr(isoDaysAgo(5))});`);
  }
  postReactionCounts.set(post.id, reactorIds.size);
}

// Comments
const commentCountByPost = new Map<string, number>();
for (let i = 0; i < COMMENT_COUNT; i++) {
  const post = pick(posts);
  const commenter = pick(students);
  const id = randomUUID();
  const content = pick(COMMENT_TEMPLATES);
  const createdAt = isoDaysAgo(4);

  lines.push(
    `INSERT INTO comments (id, post_id, author_user_id, anonymous_profile_id, content, status, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(post.id)}, ${sqlStr(commenter.userId)}, ${sqlStr(commenter.profileId)}, ${sqlStr(content)}, 'published', ${sqlStr(createdAt)}, ${sqlStr(createdAt)});`,
  );
  commentCountByPost.set(post.id, (commentCountByPost.get(post.id) ?? 0) + 1);
}

// Sync denormalized counters
for (const post of posts) {
  lines.push(
    `UPDATE posts SET like_count = ${postLikeCounts.get(post.id) ?? 0}, reaction_count = ${postReactionCounts.get(post.id) ?? 0}, comment_count = ${commentCountByPost.get(post.id) ?? 0} WHERE id = ${sqlStr(post.id)};`,
  );
}

// Confessions (some mutual, to seed a couple of matches)
function sendConfession(fromIndex: number, toIndex: number, message: string, response: string | null) {
  const from = students[fromIndex]!;
  const to = students[toIndex]!;
  const id = randomUUID();
  lines.push(
    `INSERT INTO confessions (id, sender_user_id, recipient_profile_id, message, created_at) VALUES (${sqlStr(id)}, ${sqlStr(from.userId)}, ${sqlStr(to.profileId)}, ${sqlStr(message)}, ${sqlStr(isoDaysAgo(10))});`,
  );
  if (response) {
    lines.push(
      `INSERT INTO confession_responses (id, confession_id, responder_user_id, response, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(id)}, ${sqlStr(to.userId)}, ${sqlStr(response)}, ${sqlStr(isoDaysAgo(9))});`,
    );
  }
}

for (let i = 0; i < 15; i++) {
  const a = Math.floor(Math.random() * students.length);
  let b = Math.floor(Math.random() * students.length);
  if (b === a) b = (b + 1) % students.length;
  sendConfession(a, b, "I think you're really interesting, we should talk more!", pick(["interested", "sweet", "not_interested"]));
}

// A couple of guaranteed mutual pairs -> matches
function seedMutualMatch(aIndex: number, bIndex: number) {
  sendConfession(aIndex, bIndex, "I've noticed you around campus and think you're great!", "interested");
  sendConfession(bIndex, aIndex, "Honestly I feel the same way!", "interested");

  const a = students[aIndex]!;
  const b = students[bIndex]!;
  const [userAId, userBId] = a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId];
  const matchId = randomUUID();
  const conversationId = randomUUID();
  lines.push(
    `INSERT INTO matches (id, user_a_id, user_b_id, status, created_at, updated_at) VALUES (${sqlStr(matchId)}, ${sqlStr(userAId)}, ${sqlStr(userBId)}, 'active', ${sqlStr(isoDaysAgo(7))}, ${sqlStr(isoDaysAgo(7))});`,
  );
  lines.push(`INSERT INTO conversations (id, match_id, created_at) VALUES (${sqlStr(conversationId)}, ${sqlStr(matchId)}, ${sqlStr(isoDaysAgo(7))});`);

  const chatLines = ["Hey! Congrats on matching 😄", "Haha thanks! This is fun.", "So what are you up to this weekend?"];
  chatLines.forEach((message, idx) => {
    const sender = idx % 2 === 0 ? a : b;
    lines.push(
      `INSERT INTO messages (id, conversation_id, sender_user_id, message, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(conversationId)}, ${sqlStr(sender.userId)}, ${sqlStr(message)}, ${sqlStr(isoDaysAgo(6))});`,
    );
  });
}

seedMutualMatch(0, 1);
seedMutualMatch(2, 3);

// Notifications for the seeded confessions/matches (best-effort, non-exhaustive)
lines.push(
  `INSERT INTO notifications (id, user_id, type, payload, is_read, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(students[0]!.userId)}, 'mutual_interest', ${sqlStr(JSON.stringify({ withProfileId: students[1]!.profileId }))}, 0, ${sqlStr(isoDaysAgo(7))});`,
);

// Events
const EVENT_TITLES = [
  ["Campus Movie Night", "Bring snacks and blankets!", "Main lawn"],
  ["Board Game Night", "All skill levels welcome.", "Student Center Room 2"],
  ["Study Jam for Finals", "Group study session with snacks.", "Library 3rd floor"],
  ["Open Mic Night", "Sign up to perform or just watch.", "Campus Café"],
  ["Pickup Basketball", "Casual games, everyone welcome.", "Gym court 1"],
];
for (const [title, description, location] of EVENT_TITLES) {
  const creator = pick(students);
  const id = randomUUID();
  lines.push(
    `INSERT INTO events (id, created_by_user_id, anonymous_profile_id, title, description, location, starts_at, status, created_at) VALUES (${sqlStr(id)}, ${sqlStr(creator.userId)}, ${sqlStr(creator.profileId)}, ${sqlStr(title!)}, ${sqlStr(description!)}, ${sqlStr(location!)}, ${sqlStr(isoDaysFromNow(Math.floor(Math.random() * 14) + 1))}, 'published', ${sqlStr(isoDaysAgo(3))});`,
  );
  const attendees = pickSome(students, 2, 12);
  for (const attendee of attendees) {
    lines.push(`INSERT INTO event_participants (id, event_id, user_id, created_at) VALUES (${sqlStr(randomUUID())}, ${sqlStr(id)}, ${sqlStr(attendee.userId)}, ${sqlStr(isoDaysAgo(2))});`);
  }
}

lines.push("PRAGMA foreign_keys = ON;");

const tmpDir = mkdtempSync(join(tmpdir(), "campusimi-seed-"));
const sqlPath = join(tmpDir, "seed.sql");
writeFileSync(sqlPath, lines.join("\n"), "utf8");

console.log(`Generated ${lines.length} SQL statements (${students.length} students, ${posts.length} posts, ~${COMMENT_COUNT} comments).`);
console.log(`Applying to local D1 database via wrangler...`);

execFileSync("npx", ["wrangler", "d1", "execute", "campusimi-db", "--local", "--file", sqlPath], {
  stdio: "inherit",
});

console.log(`\nSeed complete. All seeded students share the dev-only password: "${SEED_PASSWORD}"`);
console.log(`Example login: ${students[0]!.email}`);

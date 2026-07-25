#!/usr/bin/env node
// Seed rich QA data + print magic-link sign-in URLs for admin + test.
// Run: node scripts/qa-seed.mjs
import { createClient } from "@supabase/supabase-js";
import { config as dotenv } from "dotenv";

dotenv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const baseURL = process.env.APP_URL ?? "http://localhost:3000";

const c = createClient(url, svc, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Reset ----
console.log("resetting…");
for (const table of [
  "email_events",
  "notifications",
  "participation",
  "responses_attributed",
  "responses_anonymous",
  "agenda_items",
  "shuffle_sessions",
  "prompts",
  "meetings",
  "meeting_series",
  "unavailability_windows",
]) {
  const { error } = await c.from(table).delete().not("id", "is", null);
  if (error) console.warn(`  ${table}: ${error.message}`);
}
{
  const { data } = await c.auth.admin.listUsers();
  for (const u of data.users ?? []) {
    const { error } = await c.auth.admin.deleteUser(u.id);
    if (error) console.warn(`  delete user ${u.email}: ${error.message}`);
  }
}

// ---- Users ----
async function ensureUser(email, fullName) {
  const { data, error } = await c.auth.admin.createUser({
    email,
    password: "atlas-test-password-1234",
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user;
}

console.log("creating users…");
const admin = await ensureUser("admin@atlas.com", "Admin");
const test = await ensureUser("test@atlas.com", "Test");
const u1 = await ensureUser("user1@atlas.com", "User 1");
const u2 = await ensureUser("user2@atlas.com", "User 2");

const now = Date.now();
const iso = (offset) => new Date(now + offset).toISOString();

// ---- Prompts ----
console.log("creating polls…");
const { data: openPoll } = await c
  .from("prompts")
  .insert({
    created_by: admin.id,
    owner_user_id: admin.id,
    question: "Which day works best for the retro?",
    response_type: "single_choice",
    options: [
      { id: "mon", label: "Monday" },
      { id: "wed", label: "Wednesday" },
      { id: "fri", label: "Friday" },
    ],
    anonymity: "attributed",
    timing: "async",
    is_open: true,
  })
  .select("id")
  .single();

const { data: anonPoll } = await c
  .from("prompts")
  .insert({
    created_by: admin.id,
    owner_user_id: admin.id,
    question: "How's your energy today? (1-5)",
    response_type: "rating",
    rating_min: 1,
    rating_max: 5,
    anonymity: "hard_anonymous",
    timing: "async",
    is_open: true,
  })
  .select("id")
  .single();

const { data: revealedPoll } = await c
  .from("prompts")
  .insert({
    created_by: admin.id,
    owner_user_id: admin.id,
    question: "What's the theme for next month's off-site?",
    response_type: "text",
    anonymity: "attributed",
    timing: "async",
    is_open: false,
    is_revealed: true,
    revealed_at: iso(-86_400_000),
  })
  .select("id")
  .single();
if (revealedPoll) {
  await c.from("responses_attributed").insert({
    prompt_id: revealedPoll.id,
    user_id: u1.id,
    response: { text: "Building something we actually ship." },
  });
}

// ---- Meetings ----
console.log("creating meetings…");
const { data: scheduledMeeting } = await c
  .from("meetings")
  .insert({
    title: "Weekly team sync",
    scheduled_start: iso(2 * 60 * 60 * 1000),
    timezone: "UTC",
    host_user_id: admin.id,
    created_by: admin.id,
    status: "scheduled",
  })
  .select("id")
  .single();

const { data: liveMeeting } = await c
  .from("meetings")
  .insert({
    title: "Design review — Q3 roadmap",
    scheduled_start: iso(-5 * 60 * 1000),
    timezone: "UTC",
    host_user_id: admin.id,
    created_by: admin.id,
    status: "live",
    started_at: iso(-4 * 60 * 1000),
  })
  .select("id")
  .single();

const { data: endedMeeting } = await c
  .from("meetings")
  .insert({
    title: "Kickoff retrospective",
    scheduled_start: iso(-7 * 86_400_000),
    timezone: "UTC",
    host_user_id: admin.id,
    created_by: admin.id,
    status: "ended",
    started_at: iso(-7 * 86_400_000 + 60_000),
    ended_at: iso(-7 * 86_400_000 + 45 * 60_000),
  })
  .select("id")
  .single();

if (scheduledMeeting) {
  const { data: mPrompt } = await c
    .from("prompts")
    .insert({
      meeting_id: scheduledMeeting.id,
      created_by: admin.id,
      owner_user_id: admin.id,
      question: "One word for last week?",
      response_type: "text",
      anonymity: "attributed",
      timing: "live",
      is_open: false,
    })
    .select("id")
    .single();
  await c.from("agenda_items").insert([
    {
      meeting_id: scheduledMeeting.id,
      ordinal: 0,
      title: "Wins & blockers",
      kind: "discussion",
    },
    {
      meeting_id: scheduledMeeting.id,
      ordinal: 1,
      title: "One-word check-in",
      kind: "prompt",
      prompt_id: mPrompt?.id ?? null,
    },
    {
      meeting_id: scheduledMeeting.id,
      ordinal: 2,
      title: "Who runs the retro?",
      kind: "picker",
      picker_config: { mode: "oneshot", exclude_recent: 0 },
    },
  ]);
}
if (liveMeeting) {
  const { data: firstItem } = await c
    .from("agenda_items")
    .insert({
      meeting_id: liveMeeting.id,
      ordinal: 0,
      title: "Roadmap walkthrough",
      kind: "discussion",
    })
    .select("id")
    .single();
  await c.from("agenda_items").insert({
    meeting_id: liveMeeting.id,
    ordinal: 1,
    title: "Vote: launch date",
    kind: "prompt",
    prompt_id: openPoll?.id ?? null,
  });
  if (firstItem) {
    await c
      .from("meetings")
      .update({ current_agenda_item_id: firstItem.id })
      .eq("id", liveMeeting.id);
  }
}
if (endedMeeting) {
  await c.from("agenda_items").insert([
    {
      meeting_id: endedMeeting.id,
      ordinal: 0,
      title: "How did the launch go?",
      kind: "prompt",
      prompt_id: revealedPoll?.id ?? null,
    },
    {
      meeting_id: endedMeeting.id,
      ordinal: 1,
      title: "Action items",
      kind: "discussion",
    },
  ]);
}

// ---- Series ----
console.log("creating series…");
await c.from("meeting_series").insert({
  name: "Engineering weekly",
  created_by: admin.id,
  owner_user_id: admin.id,
  rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=15;BYMINUTE=0;COUNT=8",
  timezone: "UTC",
  rotation_user_ids: [admin.id, u1.id, u2.id],
  rotation_cursor: 0,
  agenda_template: [
    { title: "Round-table", kind: "discussion" },
    { title: "Blockers", kind: "discussion" },
  ],
});

// ---- Notifications ----
console.log("creating notifications…");
await c.from("notifications").insert([
  {
    user_id: test.id,
    kind: "meeting_invited",
    payload: {
      meeting_id: scheduledMeeting?.id,
      meeting_title: "Weekly team sync",
    },
  },
  {
    user_id: test.id,
    kind: "prompt_opened",
    payload: {
      prompt_id: openPoll?.id,
      question: "Which day works best for the retro?",
    },
    read_at: iso(-3600_000),
  },
]);

// ---- Magic links ----
async function magic(email) {
  const { data, error } = await c.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseURL}/auth/callback` },
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.properties.action_link;
}

const adminLink = await magic("admin@atlas.com");
const testLink = await magic("test@atlas.com");

console.log("\n============================================");
console.log("READY. Open these in your browsers:\n");
console.log("Chrome (admin):");
console.log(adminLink);
console.log("\nBrave  (test):");
console.log(testLink);
console.log("============================================\n");

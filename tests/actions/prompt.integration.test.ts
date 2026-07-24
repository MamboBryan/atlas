import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const canRun = !!url && !!svc;

const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) {
    await admin.auth.admin.deleteUser(u.id);
  }
});

// The atlas_submit_attributed RPC uses auth.uid(), so it can't be exercised
// with a service-role key. This suite validates the underlying schema +
// counter RPC. End-to-end user-session flow is covered by Playwright.

test.runIf(canRun)(
  "prompts + participation: insert, count, reveal",
  async () => {
    const c = admin!;

    const { data: u1 } = await c.auth.admin.inviteUserByEmail(
      "creator@example.com",
      { data: { full_name: "Creator" } },
    );
    expect(u1?.user).toBeTruthy();

    const { data: u2 } = await c.auth.admin.inviteUserByEmail(
      "responder@example.com",
      { data: { full_name: "Responder" } },
    );
    expect(u2?.user).toBeTruthy();

    const { data: promptRow, error: insErr } = await c
      .from("prompts")
      .insert({
        created_by: u1!.user!.id,
        owner_user_id: u1!.user!.id,
        question: "Which color?",
        response_type: "single_choice",
        options: [
          { id: "red", label: "Red" },
          { id: "blue", label: "Blue" },
        ],
        anonymity: "attributed",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();
    expect(promptRow?.id).toBeTruthy();

    // Simulate what the RPC does, using service role (which bypasses RLS).
    await c.from("responses_attributed").insert({
      prompt_id: promptRow!.id,
      user_id: u2!.user!.id,
      response: { option_id: "blue" },
    });
    await c.from("participation").insert({
      prompt_id: promptRow!.id,
      user_id: u2!.user!.id,
    });

    const counter = await c.rpc("atlas_prompt_counter", {
      p_prompt: promptRow!.id,
    });
    expect(counter.data).toBe(1);

    const { data: resps } = await c
      .from("responses_attributed")
      .select("response")
      .eq("prompt_id", promptRow!.id);
    expect(resps?.length).toBe(1);
    expect((resps?.[0]?.response as { option_id: string })?.option_id).toBe(
      "blue",
    );

    const { error: revErr } = await c
      .from("prompts")
      .update({
        is_revealed: true,
        revealed_at: new Date().toISOString(),
        is_open: false,
      })
      .eq("id", promptRow!.id);
    expect(revErr).toBeNull();

    const { data: after } = await c
      .from("prompts")
      .select("is_revealed,is_open")
      .eq("id", promptRow!.id)
      .single();
    expect(after?.is_revealed).toBe(true);
    expect(after?.is_open).toBe(false);
  },
);

test.runIf(canRun)(
  "atlas_prompt_denominator returns active member count for standalone poll",
  async () => {
    const c = admin!;

    const { data: u1 } = await c.auth.admin.inviteUserByEmail(
      "d1@example.com",
      { data: { full_name: "D1" } },
    );
    await c.auth.admin.inviteUserByEmail("d2@example.com", {
      data: { full_name: "D2" },
    });
    await c.auth.admin.inviteUserByEmail("d3@example.com", {
      data: { full_name: "D3" },
    });

    const { data: promptRow } = await c
      .from("prompts")
      .insert({
        created_by: u1!.user!.id,
        owner_user_id: u1!.user!.id,
        question: "How's the sprint?",
        response_type: "rating",
        rating_min: 1,
        rating_max: 5,
        anonymity: "attributed",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();

    const denom = await c.rpc("atlas_prompt_denominator", {
      p_prompt: promptRow!.id,
    });

    const { count: activeCount } = await c
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    expect(denom.data).toBe(activeCount);
    expect((denom.data ?? 0) >= 3).toBe(true);
  },
);

test.runIf(canRun)(
  "atlas_submit_attributed rejects calls without auth.uid()",
  async () => {
    const c = admin!;
    const { data: u1 } = await c.auth.admin.inviteUserByEmail("n@example.com", {
      data: { full_name: "N" },
    });
    const { data: promptRow } = await c
      .from("prompts")
      .insert({
        created_by: u1!.user!.id,
        owner_user_id: u1!.user!.id,
        question: "yn?",
        response_type: "yes_no",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
        anonymity: "attributed",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();

    const { error } = await c.rpc("atlas_submit_attributed", {
      p_prompt: promptRow!.id,
      p_response: { option_id: "yes" },
    });
    expect(error?.message).toContain("unauth");
  },
);

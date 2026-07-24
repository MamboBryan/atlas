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

test.runIf(canRun)(
  "responses_anonymous row shape has no user_id key",
  async () => {
    const c = admin!;
    const { data: u1 } = await c.auth.admin.inviteUserByEmail(
      "admin@atlas.com",
      { data: { full_name: "Admin" } },
    );
    const { data: prompt } = await c
      .from("prompts")
      .insert({
        created_by: u1!.user!.id,
        owner_user_id: u1!.user!.id,
        question: "shape?",
        response_type: "text",
        anonymity: "hard_anonymous",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();

    const { data: row, error: insErr } = await c
      .from("responses_anonymous")
      .insert({ prompt_id: prompt!.id, response: { text: "hi" } })
      .select("*")
      .single();
    expect(insErr).toBeNull();
    expect(row).toBeTruthy();
    expect(Object.keys(row!)).not.toContain("user_id");
    expect(Object.keys(row!).sort()).toEqual(
      ["created_at", "id", "prompt_id", "response"].sort(),
    );
  },
);

test.runIf(canRun)(
  "atlas_submit_anonymous rejects calls without auth.uid()",
  async () => {
    const c = admin!;
    const { data: u1 } = await c.auth.admin.inviteUserByEmail(
      "admin@atlas.com",
      { data: { full_name: "Admin" } },
    );
    const { data: prompt } = await c
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
        anonymity: "hard_anonymous",
        timing: "async",
        is_open: true,
      })
      .select("id")
      .single();

    // Service role cannot invoke: revoke-all-from-public + grant-to-authenticated
    // means only user-context calls succeed. This is intentional — the RPC is the
    // sole write path and must run under an authenticated user session.
    const { error } = await c.rpc("atlas_submit_anonymous", {
      p_prompt: prompt!.id,
      p_response: { option_id: "yes" },
    });
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toMatch(/permission denied|unauth/);
  },
);

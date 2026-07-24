import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const canRun = !!url && !!svc;

const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  // Clean users + profiles between tests. Deleting auth.users cascades to profiles.
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) {
    await admin.auth.admin.deleteUser(u.id);
  }
});

test.runIf(canRun)(
  "inviteUserByEmail materialises a profile row via auth trigger",
  async () => {
    const c = admin!;
    const { data, error } = await c.auth.admin.inviteUserByEmail(
      "t1@example.com",
      { data: { full_name: "Test One" } },
    );
    expect(error).toBeNull();
    expect(data.user?.email).toBe("t1@example.com");
    const { data: profile, error: pErr } = await c
      .from("profiles")
      .select("display_name,role,is_active")
      .eq("id", data.user!.id)
      .single();
    expect(pErr).toBeNull();
    expect(profile?.display_name).toBe("Test One");
    expect(profile?.role).toBe("admin"); // first user is admin
    expect(profile?.is_active).toBe(true);
  },
);

import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc =
  process.env.SUPABASE_TEST_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

async function makeUser(email: string, role: "admin" | "member") {
  const { data } = await admin!.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  await admin!.from("profiles").update({ role }).eq("id", data.user!.id);
  return data.user!.id;
}

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
});

test.runIf(canRun)(
  "evaluation lifecycle: create draft, add panel, open",
  async () => {
    const c = admin!;
    const adminId = await makeUser("hiring-eval-admin@atlas.com", "admin");
    const panelId = await makeUser("hiring-eval-panel@atlas.com", "member");

    const { data: ev } = await c
      .from("evaluations")
      .insert({ name: "Backend – Aug", created_by: adminId })
      .select("id,status")
      .single();
    expect(ev!.status).toBe("draft");

    await c
      .from("evaluation_panelists")
      .insert({ evaluation_id: ev!.id, profile_id: panelId });
    await c.from("evaluations").update({ status: "open" }).eq("id", ev!.id);

    const { data: check } = await c
      .from("evaluations")
      .select("status")
      .eq("id", ev!.id)
      .single();
    expect(check!.status).toBe("open");
  },
);

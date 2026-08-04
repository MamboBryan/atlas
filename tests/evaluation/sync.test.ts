import { expect, test, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { syncEvaluation } from "@/lib/evaluation/sync";

const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = !!url && !!svc;
const admin = canRun ? createClient(url!, svc!) : null;

beforeEach(async () => {
  if (!admin) return;
  const { data } = await admin.auth.admin.listUsers();
  for (const u of data.users ?? []) await admin.auth.admin.deleteUser(u.id);
  await admin.from("evaluations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
});

test.runIf(canRun)("first sync creates questions/candidates/answers; refresh deactivates removed", async () => {
  const c = admin!;
  const { data: u } = await c.auth.admin.createUser({ email: "admin@atlas.com", email_confirm: true });
  const { data: ev } = await c.from("evaluations")
    .insert({ name: "T", created_by: u!.user!.id }).select("id").single();
  const id = ev!.id;
  const mapping = { emailColumn: "Email", nameColumn: "Name", timestampColumn: null, questionColumns: ["Q1", "Q2"] };

  const g1 = { headers: ["Email","Name","Q1","Q2"], rows: [["a@x.com","Ann","a1","a2"],["b@x.com","Bob","b1","b2"]] };
  const s1 = await syncEvaluation(c, id, g1, mapping);
  expect(s1.candidatesSeen).toBe(2);
  expect((await c.from("evaluation_candidates").select("id").eq("evaluation_id", id).eq("is_active", true)).data).toHaveLength(2);

  // Refresh with b@x.com removed => b deactivated, a still active, ratings preserved.
  const g2 = { headers: ["Email","Name","Q1","Q2"], rows: [["a@x.com","Ann","a1-upd","a2"]] };
  const s2 = await syncEvaluation(c, id, g2, mapping);
  expect(s2.candidatesDeactivated).toBe(1);
  const active = (await c.from("evaluation_candidates").select("email").eq("evaluation_id", id).eq("is_active", true)).data;
  expect(active).toEqual([{ email: "a@x.com" }]);
  const ans = (await c.from("evaluation_answers").select("answer_text")
    .eq("evaluation_id", id).order("answer_text")).data;
  expect(ans!.some((a) => a.answer_text === "a1-upd")).toBe(true); // upsert updated
});

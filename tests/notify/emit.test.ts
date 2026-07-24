import { expect, test, vi } from "vitest";
import { emit } from "@/lib/notify/emit";

type Row = Record<string, unknown>;

function fakeClient() {
  const notif: Row[] = [];
  const events: Row[] = [];
  const client = {
    from(table: string) {
      if (table === "notifications") {
        return {
          insert: vi.fn(async (rows: Row[]) => {
            notif.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "email_events") {
        return {
          upsert: vi.fn(async (rows: Row[]) => {
            for (const r of rows) {
              const dup = events.find((e) => e.dedupe_key === r.dedupe_key);
              if (!dup) events.push(r);
            }
            return { error: null };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as never, notif, events };
}

test("no-op when user_ids empty", async () => {
  const { client, notif, events } = fakeClient();
  const r = await emit(
    {
      user_ids: [],
      kind: "meeting_scheduled",
      title: "t",
      body: "b",
      link: "/",
    },
    client,
  );
  expect(r).toEqual({ inApp: 0, queued: 0 });
  expect(notif.length).toBe(0);
  expect(events.length).toBe(0);
});

test("inserts in-app rows for each user, dedupes user list", async () => {
  const { client, notif } = fakeClient();
  const r = await emit(
    {
      user_ids: ["u1", "u2", "u1"],
      kind: "poll_created",
      title: "T",
      body: "B",
      link: "/polls/1",
    },
    client,
  );
  expect(r.inApp).toBe(2);
  expect(notif.length).toBe(2);
  expect(notif.map((n) => n.user_id).sort()).toEqual(["u1", "u2"]);
  expect(notif[0].kind).toBe("poll_created");
});

test("upserts email_events with dedupe key when email provided", async () => {
  const { client, events } = fakeClient();
  const dedupe = (uid: string) => `poll:1:created:user:${uid}`;
  const r = await emit(
    {
      user_ids: ["u1", "u2"],
      kind: "poll_created",
      title: "T",
      body: "B",
      link: "/",
      email: { dedupeKey: dedupe, payload: { subject: "S" } },
    },
    client,
  );
  expect(r.queued).toBe(2);
  expect(events.length).toBe(2);
  expect(events.map((e) => e.dedupe_key).sort()).toEqual([
    "poll:1:created:user:u1",
    "poll:1:created:user:u2",
  ]);
});

test("respects dedupe on re-emit (idempotent)", async () => {
  const { client, events } = fakeClient();
  const dedupe = (uid: string) => `meeting:1:scheduled:user:${uid}`;
  const payload = { subject: "S" };
  await emit(
    {
      user_ids: ["u1"],
      kind: "meeting_scheduled",
      title: "T",
      body: "B",
      link: "/",
      email: { dedupeKey: dedupe, payload },
    },
    client,
  );
  await emit(
    {
      user_ids: ["u1"],
      kind: "meeting_scheduled",
      title: "T",
      body: "B",
      link: "/",
      email: { dedupeKey: dedupe, payload },
    },
    client,
  );
  expect(events.length).toBe(1);
});

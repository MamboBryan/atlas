import { assertEquals } from "jsr:@std/assert@1";
import { handler, timingSafeEqual } from "./index.ts";

Deno.test("timingSafeEqual: equal strings", () => {
  assertEquals(timingSafeEqual("abc", "abc"), true);
});

Deno.test("timingSafeEqual: different lengths", () => {
  assertEquals(timingSafeEqual("abc", "abcd"), false);
});

Deno.test("timingSafeEqual: same length, different content", () => {
  assertEquals(timingSafeEqual("abc", "abd"), false);
});

// These tests exercise the pre-createClient auth branch only, so no
// network access is needed — but they do call Deno.env.set/delete on
// SYNC_SECRET, which requires running with `--allow-env=SYNC_SECRET`
// (see the "test" task in deno.json).

Deno.test("handler: missing x-sync-secret header → 401", async () => {
  Deno.env.set("SYNC_SECRET", "test-secret");
  const res = await handler(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { ok: false });
});

Deno.test("handler: wrong x-sync-secret header → 401", async () => {
  Deno.env.set("SYNC_SECRET", "test-secret");
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { "x-sync-secret": "wrong" },
    }),
  );
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { ok: false });
});

Deno.test("handler: SYNC_SECRET unset → 401 even with a matching-looking header", async () => {
  Deno.env.delete("SYNC_SECRET");
  const res = await handler(
    new Request("http://x", {
      method: "POST",
      headers: { "x-sync-secret": "" },
    }),
  );
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { ok: false });
});

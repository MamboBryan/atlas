import { expect, test, vi, beforeEach } from "vitest";

const SA = {
  client_email: "svc@proj.iam.gserviceaccount.com",
  private_key:
    "-----BEGIN PRIVATE KEY-----\\nMIIB...\\n-----END PRIVATE KEY-----\\n",
};

beforeEach(() => {
  vi.resetModules();
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(SA);
});

test("exchanges JWT for token then returns headers+rows", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok", expires_in: 3600 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: [
          ["Timestamp", "Email", "Q1"],
          ["t", "a@x.com", "hi"],
          ["t2", "b@x.com"],
        ],
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
  // Avoid real signing: stub the jwt module.
  vi.doMock("@/lib/sheets/jwt", () => ({
    mintServiceJwt: () => "fake.jwt.sig",
  }));
  const { readSheet } = await import("@/lib/sheets/client");

  const grid = await readSheet("sheet123", "Form Responses 1");
  expect(grid.headers).toEqual(["Timestamp", "Email", "Q1"]);
  expect(grid.rows[1]).toEqual(["t2", "b@x.com", ""]); // padded ragged row
  // token request used the token endpoint
  expect(fetchMock.mock.calls[0][0]).toContain("oauth2.googleapis.com/token");
});

test("throws a clear error on HTTP failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "denied",
    }),
  );
  vi.doMock("@/lib/sheets/jwt", () => ({
    mintServiceJwt: () => "fake.jwt.sig",
  }));
  const { readSheet } = await import("@/lib/sheets/client");
  await expect(readSheet("sheet123")).rejects.toThrow(/token/i);
});

import { expect, test } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mintServiceJwt } from "@/lib/sheets/jwt";

function b64urlToJson(seg: string) {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

test("mints a verifiable RS256 JWT with the right claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = 1_700_000_000;
  const jwt = mintServiceJwt({ client_email: "svc@proj.iam.gserviceaccount.com", private_key: pem }, now);

  const [h, p, s] = jwt.split(".");
  expect(b64urlToJson(h)).toEqual({ alg: "RS256", typ: "JWT" });
  const claims = b64urlToJson(p);
  expect(claims.iss).toBe("svc@proj.iam.gserviceaccount.com");
  expect(claims.scope).toBe("https://www.googleapis.com/auth/spreadsheets.readonly");
  expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  expect(claims.iat).toBe(now);
  expect(claims.exp).toBe(now + 3600);

  const v = createVerify("RSA-SHA256");
  v.update(`${h}.${p}`);
  expect(v.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
});

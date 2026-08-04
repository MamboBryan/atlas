import { createSign } from "node:crypto";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64url");

export function mintServiceJwt(
  sa: { client_email: string; private_key: string },
  nowSec?: number,
): string {
  const iat = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  // private_key may arrive with literal "\n"; normalize.
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const sig = signer.sign(pem);
  return `${signingInput}.${b64url(sig)}`;
}

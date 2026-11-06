import test from "node:test";
import assert from "node:assert/strict";
import { issueCode, verifyCode, safeNext, digest, validSession } from "../lib/email-auth.ts";

process.env.AUTH_SECRET = "test-secret-only-".repeat(4);
process.env.RESEND_API_KEY = "test-only";
process.env.AUTH_EMAIL_FROM = "Login <login@example.com>";
process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-only";

test("secure delivery, browser binding, and session lookup", async () => {
  const original = globalThis.fetch;
  let stored;
  let delivered;
  let verified = false;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === "https://api.resend.com/emails") {
      delivered = body;
      return Response.json({ id: "test" });
    }
    if (body[0] === "EVAL" && body[2] === 3 && body[3] === "auth:send:hour") {
      stored = JSON.parse(body[6]);
      return Response.json({ result: 1 });
    }
    if (body[0] === "GET") return Response.json({ result: verified ? "1" : null });
    if (body[0] === "EVAL") {
      const ok = !verified && body[6] === stored.hash;
      if (ok) verified = true;
      return Response.json({ result: ok ? 1 : 0 });
    }
    throw Error("Unexpected command");
  };
  try {
    const challenge = await issueCode();
    assert.match(challenge, /^[a-f0-9]{64}$/);
    assert.deepEqual(delivered.to, ["scott@anchorinvest.co"]);
    const code = delivered.text.match(/\b[0-9]{6}\b/)[0];
    assert.equal(stored.hash, digest(`code:${challenge}:${code}`));
    assert.equal(await verifyCode(code, "0".repeat(64)), null);
    const session = await verifyCode(code, challenge);
    assert.match(session, /^[a-f0-9]{64}$/);
    assert.equal(await validSession(session), true);
    assert.equal(await verifyCode(code, challenge), null);
    assert.equal(await verifyCode("123", challenge), null);
  } finally { globalThis.fetch = original; }
});

test("local redirects only", () => {
  for (const input of ["//evil.example", "/\\evil.example", "https://evil.example", "/\r\nevil"]) {
    assert.equal(safeNext(input), "/");
  }
  assert.equal(safeNext("/rankings?sort=value"), "/rankings?sort=value");
});

test("provider failures fail closed without exposing code or credentials", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => url === "https://api.resend.com/emails"
    ? new Response("secret provider response", { status: 401 })
    : Response.json({ result: 1 });
  try { await assert.rejects(issueCode(), { message: "Email delivery unavailable" }); }
  finally { globalThis.fetch = original; }
});

import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's native TypeScript test runner requires the explicit .ts suffix.
import { hasAccess, safeReturnTo } from "../lib/access.ts";
const owner = { email: "scott@anchorinvest.co", email_verified: true, amr: ["pwd", "mfa"] };
test("only the verified owner with completed MFA can access data", () => {
  assert.equal(hasAccess(owner), true);
  assert.equal(hasAccess({ ...owner, email: "SCOTT@ANCHORINVEST.CO" }), true);
  for (const user of [{}, { ...owner, email: "other@example.com" }, { ...owner, email_verified: false }, { ...owner, email_verified: "true" }, { ...owner, amr: ["pwd"] }, { ...owner, amr: "mfa" }]) assert.equal(hasAccess(user), false);
});
test("login return paths stay on this application", () => {
  for (const value of [undefined, "https://example.com", "//example.com", "/\\example.com", "/\nexample.com"]) assert.equal(safeReturnTo(value), "/");
  assert.equal(safeReturnTo("/analyze?parcel=123"), "/analyze?parcel=123");
});

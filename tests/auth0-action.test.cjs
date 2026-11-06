const assert = require("node:assert/strict");
const { test } = require("node:test");
const { onExecutePostLogin } = require("../scripts/auth0-post-login.cjs");
test("Auth0 policy denies outsiders and requests MFA only for the configured app", async () => {
  for (const [user, secret, client, expected] of [
    [{ email: "scott@anchorinvest.co", email_verified: true }, "app", "app", "mfa"],
    [{ email: "other@example.com", email_verified: true }, "app", "app", "deny"],
    [{ email: "scott@anchorinvest.co", email_verified: false }, "app", "app", "deny"],
    [{}, "", "app", "deny"], [{}, "app", "other", "none"],
  ]) {
    let result = "none";
    await onExecutePostLogin({ user, secrets: { PROPERTY_APP_CLIENT_ID: secret }, client: { client_id: client } }, {
      access: { deny() { result = "deny"; } },
      multifactor: { enable(factor, options) { assert.equal(factor, "any"); assert.equal(options.allowRememberBrowser, false); result = "mfa"; } },
    });
    assert.equal(result, expected);
  }
});

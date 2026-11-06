import { createHmac, randomInt, randomBytes } from "node:crypto";

export const EMAIL = "scott@anchorinvest.co";
export const TTL = 600;
export const SESSION_TTL = 43200;
export const enabled = () => process.env.EMAIL_CODE_ENABLED === "true";
export function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return value;
}
export function digest(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function safeNext(value: unknown) {
  const path = String(value ?? "/");
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\\\r\n]/.test(path) ? path : "/";
}
export async function redis(...command: (string | number)[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.startsWith("https://") || !token) throw new Error("Authentication storage is not configured");
  const response = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Authentication storage unavailable");
  const data = await response.json();
  if (data.error) throw new Error("Authentication storage failed");
  return data.result;
}
export const ISSUE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if n > 5 then return 0 end
if not redis.call('SET', KEYS[2], '1', 'EX', 60, 'NX') then return 0 end
redis.call('SET', KEYS[3], ARGV[1], 'EX', 600)
return 1
`;
export const VERIFY = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end
if n > 10 then return 0 end
local value = redis.call('GET', KEYS[2])
if not value then return 0 end
local record = cjson.decode(value)
record.attempts = record.attempts + 1
if record.hash == ARGV[1] then
  redis.call('DEL', KEYS[2])
  redis.call('SET', KEYS[3], '1', 'EX', 43200)
  return 1
end
if record.attempts >= 5 then redis.call('DEL', KEYS[2])
else redis.call('SET', KEYS[2], cjson.encode(record), 'KEEPTTL') end
return 0
`;
export async function issueCode() {
  secret();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!key || !from || /[\r\n]/.test(from)) throw new Error("Email delivery is not configured");
  const code = randomInt(0, 1000000).toString().padStart(6, "0");
  const challenge = randomBytes(32).toString("hex");
  const record = JSON.stringify({ hash: digest(`code:${challenge}:${code}`), attempts: 0 });
  const allowed = await redis("EVAL", ISSUE, 3, "auth:send:hour", "auth:send:cooldown", "auth:code", record);
  if (allowed !== 1) return null;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [EMAIL], subject: "Your Property Extraction sign-in code",
        text: `Your sign-in code is ${code}. It expires in 10 minutes and can be used once. If you did not request it, ignore this email.` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  } catch {
    // Do not expose provider responses, credentials, or the code.
    throw new Error("Email delivery unavailable");
  }
  return challenge;
}
export async function verifyCode(code: string, challenge: string) {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(challenge)) return null;
  const session = randomBytes(32).toString("hex");
  const ok = await redis("EVAL", VERIFY, 3, "auth:verify:window", "auth:code",
    `auth:session:${digest(session)}`, digest(`code:${challenge}:${code}`));
  return ok === 1 ? session : null;
}
export async function validSession(value: string | undefined) {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return false;
  return await redis("GET", `auth:session:${digest(value)}`) === "1";
}


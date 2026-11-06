import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PERIOD_SECONDS = 30;
const SESSION_SECONDS = 30 * 60;
const ISSUER = "Property Extraction";
const ACCOUNT = "scott@anchorinvest.co";

export function authenticatorEnabled() {
  return process.env.AUTHENTICATOR_LOGIN_ENABLED === "true" && (process.env.AUTH_SECRET?.length ?? 0) >= 32;
}

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("Authenticator login requires a 32-character AUTH_SECRET");
  return value;
}

function authenticatorKey() {
  return createHmac("sha256", authSecret()).update("property-extraction:authenticator:v1").digest().subarray(0, 20);
}

function base32(input: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function setupDetails() {
  const secret = base32(authenticatorKey());
  const label = encodeURIComponent(`${ISSUER}:${ACCOUNT}`);
  const issuer = encodeURIComponent(ISSUER);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
}

function codeForStep(step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", authenticatorKey()).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, "0");
}

export function validAuthenticatorCode(value: string, now = Date.now()) {
  if (!/^\d{6}$/.test(value)) return false;
  const current = Math.floor(now / 1000 / PERIOD_SECONDS);
  const supplied = Buffer.from(value);
  return [-1, 0, 1].some((offset) => timingSafeEqual(supplied, Buffer.from(codeForStep(current + offset))));
}

function sessionMac(payload: string) {
  return createHmac("sha256", authSecret()).update(`totp-session:v1:${payload}`).digest("hex");
}

export function newAuthenticatorSession(now = Date.now()) {
  const payload = `${Math.floor(now / 1000)}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sessionMac(payload)}`;
}

export function validAuthenticatorSession(value: string | undefined, now = Date.now()) {
  if (!value || !/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(value)) return false;
  const lastDot = value.lastIndexOf(".");
  const payload = value.slice(0, lastDot);
  const supplied = Buffer.from(value.slice(lastDot + 1), "hex");
  if (!timingSafeEqual(supplied, Buffer.from(sessionMac(payload), "hex"))) return false;
  const issued = Number(payload.slice(0, payload.indexOf(".")));
  const nowSeconds = Math.floor(now / 1000);
  return issued <= nowSeconds && nowSeconds - issued < SESSION_SECONDS;
}

export const AUTHENTICATOR_SESSION_SECONDS = SESSION_SECONDS;

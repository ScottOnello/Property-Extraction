export const OWNER_EMAIL = "scott@anchorinvest.co";

export function hasAccess(user: Record<string, unknown>) {
  return user.email_verified === true &&
    typeof user.email === "string" && user.email.toLowerCase() === OWNER_EMAIL &&
    Array.isArray(user.amr) && user.amr.includes("mfa");
}

export function safeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  return value;
}

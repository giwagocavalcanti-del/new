import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Staff sign-in for the order pages under /admin. The accounts are set in
// ADMIN_ACCOUNTS as "name:password,other:password" (long random passwords).
// A signed cookie keeps the person signed in for 12 hours; changing
// ADMIN_ACCOUNTS (or ADMIN_SESSION_SECRET) signs everybody out.

export const ADMIN_COOKIE = "lw_admin";
const SESSION_HOURS = 12;
const digest = (value: string) => createHash("sha256").update(value).digest();

function accounts(): { name: string; password: string }[] {
  return (process.env.ADMIN_ACCOUNTS ?? "")
    .split(",")
    .map((entry) => {
      const separator = entry.indexOf(":");
      return separator < 1 ? null : { name: entry.slice(0, separator).trim(), password: entry.slice(separator + 1).trim() };
    })
    .filter((account): account is { name: string; password: string } => Boolean(account?.name && account.password));
}

export const adminConfigured = () => accounts().length > 0;

function signingKey() {
  return createHash("sha256")
    .update(`luxuswand-admin|${process.env.ADMIN_SESSION_SECRET ?? ""}|${process.env.ADMIN_ACCOUNTS ?? ""}`)
    .digest();
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** The name of the account, or null. Every account is compared, in constant time. */
export function checkLogin(name: string, password: string): string | null {
  let match: string | null = null;
  for (const account of accounts()) {
    const nameOk = timingSafeEqual(digest(account.name.toLowerCase()), digest(name.trim().toLowerCase()));
    const passwordOk = timingSafeEqual(digest(account.password), digest(password));
    if (nameOk && passwordOk) match = account.name;
  }
  return match;
}

export function sessionCookie(name: string) {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ name, expires })).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 60 * 60 };
}

/** The signed-in staff member, or null when the cookie is missing, forged or expired. */
export function readSession(value: string | undefined): string | null {
  if (!value || !adminConfigured()) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const { name, expires } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { name?: unknown; expires?: unknown };
    if (typeof name !== "string" || typeof expires !== "number" || expires < Date.now()) return null;
    // An account removed from ADMIN_ACCOUNTS loses access straight away.
    return accounts().some((account) => account.name === name) ? name : null;
  } catch {
    return null;
  }
}

/** For server components: the signed-in staff member, or null. */
export async function currentAdmin(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  return readSession((await cookies()).get(ADMIN_COOKIE)?.value);
}

function cookieFrom(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * For the staff forms: the signed-in staff member, or null. Also refuses a form
 * sent from another site (the cookie is SameSite=Strict as well).
 */
export function adminFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) {
    return null;
  }
  return readSession(cookieFrom(request, ADMIN_COOKIE));
}

export const isSameSite = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || origin === process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
};

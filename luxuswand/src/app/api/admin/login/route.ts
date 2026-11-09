import { ADMIN_COOKIE, adminConfigured, checkLogin, isSameSite, sessionCookie } from "@/server/admin-auth";

const back = (request: Request, path: string) => Response.redirect(new URL(path, request.url), 303);

// Sign-in form of the staff pages. A wrong attempt waits a moment before
// answering, which slows down anyone trying passwords one after another.
export async function POST(request: Request) {
  if (!adminConfigured()) return back(request, "/admin/login?error=not_configured");
  if (!isSameSite(request)) return new Response("Forbidden", { status: 403 });

  const form = await request.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").slice(0, 100);
  const password = String(form?.get("password") ?? "").slice(0, 200);
  const account = name && password ? checkLogin(name, password) : null;
  if (!account) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return back(request, "/admin/login?error=wrong");
  }

  const { value, maxAge } = sessionCookie(account);
  const secure = new URL(request.url).protocol === "https:";
  // Response.redirect() has read-only headers, so the cookie needs a response built by hand.
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL("/admin", request.url).toString(),
      "set-cookie": `${ADMIN_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`,
    },
  });
}

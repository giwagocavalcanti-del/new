import { db } from "@/server/db";
import { findTrackingToken, normaliseRef } from "@/server/orders";

// Exchanges an order number plus the email used at checkout for the tracking link.
// The answer is the same whether the number or the email is wrong.
export async function POST(request: Request) {
  if (!db()) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = ((await request.json().catch(() => null)) ?? {}) as { ref?: unknown; email?: unknown };
  const ref = typeof body.ref === "string" ? normaliseRef(body.ref) : null;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!ref || !email || email.length > 320) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    const token = await findTrackingToken(ref, email);
    return token ? Response.json({ token }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("Order lookup failed", error);
    return Response.json({ error: "temporarily_unavailable" }, { status: 500 });
  }
}

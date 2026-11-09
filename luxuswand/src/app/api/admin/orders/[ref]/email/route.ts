import { adminFromRequest } from "@/server/admin-auth";
import { db, type EmailKind } from "@/server/db";
import { resendEmail } from "@/server/email";
import { getOrderByRef, normaliseRef } from "@/server/orders";
import { siteOrigin } from "@/server/stripe";

const KINDS: EmailKind[] = ["confirmation", "dispatched", "out_for_delivery", "delivered"];

// Staff button: send again an email that failed or was refused.
export async function POST(request: Request, context: RouteContext<"/api/admin/orders/[ref]/email">) {
  const actor = adminFromRequest(request);
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!db()) return new Response("Not configured", { status: 503 });

  const ref = normaliseRef((await context.params).ref);
  const order = ref ? await getOrderByRef(ref) : null;
  if (!order) return new Response("Not found", { status: 404 });

  const kind = String((await request.formData()).get("kind")) as EmailKind;
  if (!KINDS.includes(kind)) return new Response("Bad request", { status: 400 });

  const result = await resendEmail(order.id, kind, siteOrigin(request));
  return Response.redirect(new URL(`/admin/orders/${order.ref}?email=${result}`, request.url), 303);
}

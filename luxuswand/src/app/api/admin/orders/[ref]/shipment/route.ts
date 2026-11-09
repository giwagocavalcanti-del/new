import { adminFromRequest } from "@/server/admin-auth";
import { db } from "@/server/db";
import { parseStaffShipment, staffUpdateShipment } from "@/server/delivery";
import { getOrderByRef, normaliseRef } from "@/server/orders";
import { siteOrigin } from "@/server/stripe";

// Staff form: carrier, tracking number, link, status and an optional note.
export async function POST(request: Request, context: RouteContext<"/api/admin/orders/[ref]/shipment">) {
  const actor = adminFromRequest(request);
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!db()) return new Response("Not configured", { status: 503 });

  const ref = normaliseRef((await context.params).ref);
  const order = ref ? await getOrderByRef(ref) : null;
  if (!order) return new Response("Not found", { status: 404 });

  const page = (query: string) => Response.redirect(new URL(`/admin/orders/${order.ref}?${query}`, request.url), 303);

  const parsed = parseStaffShipment(await request.formData());
  if ("error" in parsed) return page(`error=${encodeURIComponent(parsed.error)}`);

  try {
    const result = await staffUpdateShipment(order, actor, parsed.input, siteOrigin(request));
    if (!result.ok) return page(`error=${encodeURIComponent(result.error)}`);
    return page(result.changed ? "saved=1" : "unchanged=1");
  } catch (error) {
    console.error("Staff shipment update failed", error);
    return page(`error=${encodeURIComponent("Não foi possível salvar. Tente de novo.")}`);
  }
}

import { db } from "@/server/db";
import { confirmReceipt } from "@/server/delivery";
import { getOrderByTrackingToken } from "@/server/orders";

// The "Ich habe meine Bestellung erhalten" button on the tracking page. The secret
// tracking link is what identifies the customer; a plain form post, so it also
// works without JavaScript. Always goes back to the tracking page.
export async function POST(request: Request, context: RouteContext<"/api/track/[token]/received">) {
  const { token } = await context.params;
  const page = (query: string) => Response.redirect(new URL(`/track/${encodeURIComponent(token)}${query}`, request.url), 303);

  if (!db()) return new Response("Not configured", { status: 503 });
  const order = token.length <= 100 ? await getOrderByTrackingToken(token) : null;
  if (!order) return page("");

  try {
    const result = await confirmReceipt(order);
    return page(result === "not_shippable" ? "?received=no" : "?received=1");
  } catch (error) {
    console.error("Receipt confirmation failed", error);
    return page("?received=error");
  }
}

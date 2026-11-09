import { db } from "@/server/db";
import { authenticatePartner, hasInboundPartners, parseDeliveryEvent, recordDeliveryEvent } from "@/server/delivery";
import { siteOrigin } from "@/server/stripe";

const reply = (body: object, status: number) => Response.json(body, { status });

// Public API for delivery partners: one delivery update per request.
// The contract is documented in docs/delivery-partner-api.md.
export async function POST(request: Request) {
  if (!db() || !hasInboundPartners()) return reply({ error: "not_configured" }, 503);

  const partner = authenticatePartner(request);
  if (!partner) return reply({ error: "unauthorized" }, 401);

  const body: unknown = await request.json().catch(() => undefined);
  if (body === undefined) {
    return reply({ error: "invalid_request", details: [{ field: "(body)", message: "must be valid JSON" }] }, 400);
  }

  const parsed = parseDeliveryEvent(body);
  if ("errors" in parsed) return reply({ error: "invalid_request", details: parsed.errors }, 400);

  try {
    const result = await recordDeliveryEvent(partner, parsed.event, body, siteOrigin(request));
    switch (result.outcome) {
      case "shipment_not_found":
        return reply({ error: "shipment_not_found" }, 404);
      case "order_not_ready":
        return reply({ error: "order_not_ready" }, 409);
      case "order_not_shippable":
        return reply({ error: "order_not_shippable" }, 409);
      case "forbidden":
        return reply({ error: "forbidden" }, 403);
      default:
        return reply(
          {
            received: true,
            duplicate: result.outcome === "duplicate",
            order_ref: result.orderRef,
            shipment_status: result.shipmentStatus,
          },
          200,
        );
    }
  } catch (error) {
    console.error("Delivery event failed", error);
    return reply({ error: "temporarily_unavailable" }, 500);
  }
}

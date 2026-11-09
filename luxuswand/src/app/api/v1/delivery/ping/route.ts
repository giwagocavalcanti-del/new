import { authenticatePartner, hasInboundPartners } from "@/server/delivery";

// Lets a delivery partner check its key before sending real updates.
export async function GET(request: Request) {
  if (!hasInboundPartners()) return Response.json({ error: "not_configured" }, { status: 503 });
  const partner = authenticatePartner(request);
  if (!partner) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, partner });
}

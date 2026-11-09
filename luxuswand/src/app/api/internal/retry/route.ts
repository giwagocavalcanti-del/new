import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { retryShipments } from "@/server/delivery";
import { retryEmails } from "@/server/email";
import { siteOrigin } from "@/server/stripe";
import { retryUtmify } from "@/server/utmify";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Second chance for whatever failed when an order was paid: shipments the
// delivery partner has not accepted, sales UTMify has not received and
// confirmation emails that did not go out.
// Meant to be called on a schedule (for example a Vercel cron job), which
// sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !db()) return Response.json({ error: "not_configured" }, { status: 503 });

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!timingSafeEqual(digest(given), digest(secret))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const origin = siteOrigin(request);
    const shipments = await retryShipments(`${origin}/api/v1/delivery/events`);
    const utmify = await retryUtmify();
    const emails = await retryEmails(origin);
    return Response.json({ shipments, utmify, emails });
  } catch (error) {
    console.error("Retry failed", error);
    return Response.json({ error: "retry_failed" }, { status: 500 });
  }
}

import type Stripe from "stripe";
import { site } from "@/config/site";
import { db } from "@/server/db";
import { fulfilPaidSession, handleAsyncPaymentFailed, handlePaymentFailed, handleRefund } from "@/server/fulfilment";
import { cancelUnpaidOrder } from "@/server/orders";
import { siteOrigin, stripeClient } from "@/server/stripe";

// Stripe calls this address when something happens to a payment. Together with
// the confirmation page (which asks Stripe directly) it is the only place an
// order becomes "paid": the browser is never trusted for that.
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = stripeClient();
  if (!webhookSecret || !stripe || !db()) return Response.json({ error: "not_configured" }, { status: 503 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", webhookSecret);
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  // The preview only ever works with test payments.
  if (site.sampleMode && event.livemode) return Response.json({ received: true, ignored: "live_event_in_preview" });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const outcome = await fulfilPaidSession(event.data.object, stripe, siteOrigin(request));
        if (outcome === "unknown_order") {
          // A payment with no matching order must not pass silently: failing here
          // makes Stripe retry and warn the account owner.
          console.error("Stripe payment without a matching order", event.data.object.id);
          return Response.json({ error: "unknown_order" }, { status: 500 });
        }
        break;
      }
      case "checkout.session.async_payment_failed":
        await handleAsyncPaymentFailed(event.data.object);
        break;
      case "checkout.session.expired": {
        const orderId = event.data.object.client_reference_id;
        if (orderId) await cancelUnpaidOrder(orderId);
        break;
      }
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      case "charge.refunded":
        await handleRefund(event.data.object);
        break;
    }
  } catch (error) {
    // Answering with an error makes Stripe send the event again later.
    console.error(`Stripe webhook ${event.type} failed`, error);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}

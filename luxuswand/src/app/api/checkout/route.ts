import { createHash } from "node:crypto";
import { site } from "@/config/site";
import { dimensions, getProduct } from "@/data/catalogue";
import { cleanTrackingParams } from "@/lib/attribution-params";
import { parseCheckoutDetails, type CheckoutDetails } from "@/lib/checkout-form";
import { cleanLines, deliveryOptionsFor, launchPricesOutdated, priceBasket } from "@/lib/pricing";
import { db, type OrderRow } from "@/server/db";
import {
  attachStripeSession,
  cancelUnpaidOrder,
  createPendingOrder,
  getOrderByCheckoutKey,
  releaseCheckoutKey,
} from "@/server/orders";
import { findShortages } from "@/server/stock";
import { isTestKey, siteOrigin, stripeClient } from "@/server/stripe";
import type Stripe from "stripe";

const fail = (error: string, status: number, extra: object = {}) => Response.json({ error, ...extra }, { status });

// Stripe closes an unpaid checkout after this long, which also closes the order.
const SESSION_MINUTES = 60;
const CHECKOUT_KEY = /^[A-Za-z0-9_-]{16,64}$/;

/** What was ordered, to recognise the same checkout sent twice. */
function fingerprintOf(lines: { slug: string; qty: number }[], details: CheckoutDetails, deliveryId: string, totalPence: number) {
  const sorted = [...lines].sort((a, b) => a.slug.localeCompare(b.slug));
  return createHash("sha256").update(JSON.stringify({ sorted, details, deliveryId, totalPence })).digest("hex");
}

/**
 * The same checkout page sending the same order again (double click, reload,
 * back button) gets the payment page it already has instead of a second order.
 * Returns the address to send the customer to, or null to start a new order.
 */
async function reuseCheckout(existing: OrderRow, fingerprint: string, stripe: Stripe, origin: string) {
  if ((existing.status === "paid" || existing.status === "processing") && existing.stripe_session_id) {
    return `${origin}/checkout/success?session_id=${existing.stripe_session_id}`;
  }
  if (existing.status === "awaiting_payment" && existing.stripe_session_id) {
    const session = await stripe.checkout.sessions.retrieve(existing.stripe_session_id).catch(() => null);
    if (session?.status === "open" && session.url && existing.checkout_fingerprint === fingerprint) return session.url;
    // The basket or the address changed: the old payment page must not stay usable.
    if (session?.status === "open") await stripe.checkout.sessions.expire(session.id).catch(() => null);
    await cancelUnpaidOrder(existing.id);
  }
  await releaseCheckoutKey(existing.id);
  return null;
}

// Saves the order with the customer's details and sends them to Stripe Checkout
// to pay. The browser only sends product slugs, quantities, the details typed on
// the checkout page and the chosen delivery: every amount is recomputed here.
export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const lines = cleanLines(body.lines);
  if (lines.length === 0 || !Array.isArray(body.lines) || lines.length !== body.lines.length) {
    return fail("invalid_basket", 400);
  }

  // The launch prices have ended but the catalogue was not updated yet: charging the old
  // price would contradict what the product pages announced, so no order is taken.
  if (launchPricesOutdated(Date.now())) return fail("prices_updating", 503);

  const parsed = parseCheckoutDetails(body.details);
  if ("errors" in parsed) return fail("invalid_details", 400, { fields: parsed.errors });
  const { details } = parsed;

  const basket = priceBasket(lines);
  const delivery = deliveryOptionsFor(basket.subtotalPence).find((option) => option.id === body.deliveryOptionId);
  if (!delivery) return fail("invalid_delivery", 400);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeClient();
  if (!secretKey || !stripe) return fail("payments_not_connected", 503);
  // Money is never taken for an order the shop has nowhere to record.
  if (!db()) return fail("orders_not_connected", 503);
  // Example products must never take real money.
  if (site.sampleMode && !isTestKey(secretKey)) return fail("preview_only", 403);

  const checkoutKey = typeof body.checkoutKey === "string" && CHECKOUT_KEY.test(body.checkoutKey) ? body.checkoutKey : null;
  const totalPence = basket.subtotalPence + delivery.pricePence;
  const fingerprint = fingerprintOf(lines, details, delivery.id, totalPence);
  const origin = siteOrigin(request);

  const attribution = (body.attribution && typeof body.attribution === "object" ? body.attribution : {}) as {
    consent?: unknown;
    params?: unknown;
  };
  const consent = site.attribution.enabled && attribution.consent === true;

  let orderId: string | null = null;
  try {
    if (checkoutKey) {
      const existing = await getOrderByCheckoutKey(checkoutKey);
      if (existing) {
        const url = await reuseCheckout(existing, fingerprint, stripe, origin);
        if (url) return Response.json({ url, reused: true });
      }
    }

    const shortages = await findShortages(lines);
    if (shortages.length) {
      return fail("out_of_stock", 409, {
        items: shortages.map((item) => ({ ...item, name: getProduct(item.slug)?.name ?? item.slug })),
      });
    }

    const { order, created } = await createPendingOrder({
      basket,
      details,
      delivery,
      checkoutKey,
      fingerprint,
      consent,
      trackingParams: consent ? cleanTrackingParams(attribution.params) : null,
      isTest: isTestKey(secretKey),
    });
    // Two requests from the same page at the same moment: the second one finds
    // the order the first is still setting up, and the page simply asks again.
    if (!created) {
      const url = order.stripe_session_id ? await reuseCheckout(order, fingerprint, stripe, origin) : null;
      return url ? Response.json({ url, reused: true }) : fail("checkout_busy", 409);
    }
    orderId = order.id;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "de",
      client_reference_id: order.id,
      customer_email: details.email,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      metadata: { order_ref: order.ref },
      payment_intent_data: {
        description: `Bestellung ${order.ref}`,
        metadata: { order_ref: order.ref },
        // The delivery address goes with the payment, which helps Stripe's fraud checks.
        shipping: {
          name: details.name,
          phone: details.phone ?? undefined,
          address: {
            line1: details.line1,
            line2: details.line2 ?? undefined,
            postal_code: details.postcode,
            city: details.city,
            country: details.country,
          },
        },
      },
      line_items: basket.lines.map((line) => ({
        quantity: line.qty,
        price_data: {
          currency: site.currency,
          unit_amount: line.unitPence,
          product_data: {
            name: line.product.name,
            description: dimensions(line.product.format),
          },
        },
      })),
      // Only the delivery the customer chose, so Stripe shows the same total as the checkout page.
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: delivery.label,
            fixed_amount: { amount: delivery.pricePence, currency: site.currency },
            delivery_estimate: {
              minimum: { unit: "business_day", value: delivery.minDays },
              maximum: { unit: "business_day", value: delivery.maxDays },
            },
          },
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancelled?session_id={CHECKOUT_SESSION_ID}`,
    });

    if (!session.url) throw new Error("Stripe returned a session without a payment link");
    await attachStripeSession(order.id, session.id);
    return Response.json({ url: session.url, ref: order.ref });
  } catch (error) {
    console.error("Checkout failed", error);
    // The customer never reached the payment page, so the saved order is closed.
    if (orderId) {
      await cancelUnpaidOrder(orderId).catch(() => {});
      await releaseCheckoutKey(orderId).catch(() => {});
    }
    return fail("checkout_failed", 502);
  }
}

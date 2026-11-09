import type Stripe from "stripe";
import { logCall } from "@/server/db";
import { ensureShipment, requestShipment } from "@/server/delivery";
import { notifyShipment, sendOrderEmail } from "@/server/email";
import {
  getOrderById,
  getOrderBySession,
  getOrderItems,
  markOrderPaid,
  markOrderProcessing,
  markOrderRefunded,
  markPaymentFailed,
  recordPaymentError,
  updateOrder,
} from "@/server/orders";
import { takeStock } from "@/server/stock";
import { paymentDetails } from "@/server/stripe";
import { syncOrderToUtmify } from "@/server/utmify";

// What happens once Stripe confirms a payment: the order is marked paid, the
// stock is taken, the delivery partner is asked for a shipment, the sale is
// reported to UTMify and the customer gets the confirmation email.
// Every step can be repeated safely, because Stripe may deliver an event twice
// and the confirmation page asks Stripe directly as well.

const intentId = (value: string | Stripe.PaymentIntent | null) => (typeof value === "string" ? value : (value?.id ?? null));

async function orderOf(session: Stripe.Checkout.Session) {
  return session.client_reference_id ? getOrderById(session.client_reference_id) : getOrderBySession(session.id);
}

export type FulfilOutcome = "fulfilled" | "already_fulfilled" | "processing" | "not_paid" | "unknown_order";

export async function fulfilPaidSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  origin: string,
): Promise<FulfilOutcome> {
  const found = await orderOf(session);
  if (!found) return "unknown_order";
  // The session belongs to another order: never trust it for this one.
  if (found.stripe_session_id && found.stripe_session_id !== session.id) return "unknown_order";

  // Finished, but with a payment method that settles later (for example SEPA debit).
  if (session.payment_status === "unpaid" && session.status === "complete") {
    await markOrderProcessing(found.id, intentId(session.payment_intent));
    return "processing";
  }
  if (session.payment_status !== "paid") return "not_paid";

  if (found.total_pence !== null && session.amount_total !== null && session.amount_total !== found.total_pence) {
    // Cannot happen with sessions this shop creates, so it is recorded for a person to check.
    await logCall({
      orderId: found.id,
      target: "stripe",
      action: "amount.mismatch",
      ok: false,
      detail: `Order total ${found.total_pence}, Stripe charged ${session.amount_total}`,
    });
  }

  const { order: marked, transitioned } = await markOrderPaid(found.id, {
    paidAt: new Date().toISOString(),
    paymentIntent: intentId(session.payment_intent),
  });
  let order = marked;
  // The order was cancelled or refunded in the meantime: nothing to deliver.
  if (!order || order.status !== "paid") {
    if (order?.status === "cancelled" || order?.status === "payment_failed") {
      // Money arrived for an order that was already closed: someone has to refund it.
      await logCall({ orderId: order.id, target: "stripe", action: "paid_after_close", ok: false, detail: `Payment ${session.id} on a ${order.status} order` });
    }
    return "already_fulfilled";
  }

  // Stripe's fee (for UTMify) and the payment method (for the confirmation email).
  if ((order.gateway_fee_pence === null || order.payment_method === null) && order.stripe_payment_intent) {
    const { feePence, method } = await paymentDetails(stripe, order.stripe_payment_intent);
    const found = {
      ...(order.gateway_fee_pence === null && feePence !== null ? { gateway_fee_pence: feePence } : {}),
      ...(order.payment_method === null && method !== null ? { payment_method: method } : {}),
    };
    if (Object.keys(found).length) {
      await updateOrder(order.id, found);
      order = { ...order, ...found };
    }
  }

  await takeStock(order);
  const items = await getOrderItems(order.id);
  const shipment = await requestShipment(order, items, await ensureShipment(order.id), `${origin}/api/v1/delivery/events`);
  await syncOrderToUtmify(order, items);
  await sendOrderEmail("confirmation", order, origin, { items });
  // A partner that answers "already dispatched" with a tracking number gets the email going too.
  await notifyShipment(order, shipment, origin, false);

  return transitioned ? "fulfilled" : "already_fulfilled";
}

/** A delayed payment (for example SEPA debit) did not go through. */
export async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  const order = await orderOf(session);
  if (order) await markPaymentFailed(order.id, "Die Zahlung wurde von der Bank nicht ausgeführt.");
}

/** A card was declined. The customer can still try another card on the same payment page. */
export async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const ref = intent.metadata?.order_ref;
  if (!ref) return;
  const error = intent.last_payment_error;
  await recordPaymentError(ref, [error?.decline_code ?? error?.code, error?.message].filter(Boolean).join(": ") || "declined");
}

/** A full refund in Stripe marks the order refunded and tells UTMify. */
export async function handleRefund(charge: Stripe.Charge) {
  if (!charge.refunded) return;
  const paymentIntent = intentId(charge.payment_intent);
  if (!paymentIntent) return;
  const order = await markOrderRefunded(paymentIntent);
  if (order) await syncOrderToUtmify(order);
}

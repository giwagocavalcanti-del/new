import { randomBytes, randomInt } from "node:crypto";
import { site, type DeliveryOption } from "@/config/site";
import { construction } from "@/data/catalogue";
import type { TrackingParams } from "@/lib/attribution-params";
import type { CheckoutDetails } from "@/lib/checkout-form";
import type { priceBasket } from "@/lib/pricing";
import {
  DatabaseError,
  requireDb,
  type Address,
  type OrderItemRow,
  type OrderRow,
  type ShipmentEventRow,
  type ShipmentRow,
} from "@/server/db";

// Letters and digits that are hard to confuse when read aloud or typed (no 0/O, 1/I).
const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const UNIQUE_VIOLATION = "23505";

function newRef() {
  const pick = () => Array.from({ length: 4 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** "7kq4 m2xp" and "7KQ4M2XP" both become "7KQ4-M2XP". Null when it cannot be an order number. */
export function normaliseRef(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8 || [...compact].some((char) => !REF_ALPHABET.includes(char))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function fail(action: string, error: { message: string }): never {
  throw new DatabaseError(`${action}: ${error.message}`);
}

/** Saves the basket as an order waiting for payment, before the customer is sent to pay. */
export async function createPendingOrder(input: {
  basket: ReturnType<typeof priceBasket>;
  details: CheckoutDetails;
  delivery: DeliveryOption;
  checkoutKey: string | null;
  fingerprint: string;
  consent: boolean;
  trackingParams: TrackingParams | null;
  isTest: boolean;
}): Promise<{ order: OrderRow; created: boolean }> {
  const database = requireDb();
  const { details } = input;
  let order: OrderRow | null = null;

  for (let attempt = 0; attempt < 4 && !order; attempt++) {
    const { data, error } = await database
      .from("orders")
      .insert({
        ref: newRef(),
        tracking_token: randomBytes(24).toString("base64url"),
        currency: site.currency,
        subtotal_pence: input.basket.subtotalPence,
        // What the customer agreed to pay. Stripe is asked for exactly this amount.
        delivery_pence: input.delivery.pricePence,
        total_pence: input.basket.subtotalPence + input.delivery.pricePence,
        delivery_service: input.delivery.label,
        delivery_option_id: input.delivery.id,
        customer_name: details.name,
        customer_email: details.email,
        customer_phone: details.phone,
        shipping_address: {
          line1: details.line1,
          line2: details.line2,
          city: details.city,
          county: null,
          postcode: details.postcode,
          country: details.country,
        } satisfies Address,
        checkout_key: input.checkoutKey,
        checkout_fingerprint: input.fingerprint,
        attribution_consent: input.consent,
        tracking_params: input.consent ? input.trackingParams : null,
        is_test: input.isTest,
      })
      .select()
      .single<OrderRow>();
    if (error && error.code !== UNIQUE_VIOLATION) fail("Could not create the order", error);
    // A clash on checkout_key means the same page sent two requests at once: use the first order.
    if (error && input.checkoutKey && error.message.includes("checkout_key")) {
      const existing = await findOrder("checkout_key", input.checkoutKey);
      if (existing) return { order: existing, created: false };
    }
    order = data;
  }
  if (!order) throw new DatabaseError("Could not generate a unique order number");

  const { error } = await database.from("order_items").insert(
    input.basket.lines.map((line) => ({
      order_id: order.id,
      slug: line.product.slug,
      name: line.product.name,
      quantity: line.qty,
      unit_pence: line.unitPence,
      list_unit_pence: line.product.pricePence,
      total_pence: line.totalPence,
      height_mm: line.product.format.heightMm,
      width_mm: line.product.format.widthMm,
      depth_mm: line.product.format.depthMm,
      weight_kg: construction.weightKg[line.product.format.id],
    })),
  );
  if (error) fail("Could not save the order lines", error);

  return { order, created: true };
}

/** The order started from this checkout page load, if any. */
export const getOrderByCheckoutKey = (key: string) => findOrder("checkout_key", key);

/** Frees a checkout key, so the same page can start a new order after the basket or address changed. */
export async function releaseCheckoutKey(orderId: string) {
  const { error } = await requireDb().from("orders").update({ checkout_key: null }).eq("id", orderId);
  if (error) fail("Could not release the checkout key", error);
}

export async function attachStripeSession(orderId: string, sessionId: string) {
  const { error } = await requireDb().from("orders").update({ stripe_session_id: sessionId }).eq("id", orderId);
  if (error) fail("Could not link the payment session", error);
}

/** Cancels an order that was never paid. Paid orders are left alone. */
export async function cancelUnpaidOrder(orderId: string) {
  const { error } = await requireDb()
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "awaiting_payment");
  if (error) fail("Could not cancel the order", error);
}

export type PaidDetails = {
  paidAt: string;
  paymentIntent: string | null;
};

/**
 * Marks an order as paid. Safe to call twice for the same payment:
 * `transitioned` is true only for the call that actually changed it.
 * Contact details, address and amounts were saved when the order was created
 * and are not touched here.
 */
export async function markOrderPaid(orderId: string, details: PaidDetails) {
  const database = requireDb();
  const { data, error } = await database
    .from("orders")
    .update({
      status: "paid",
      paid_at: details.paidAt,
      stripe_payment_intent: details.paymentIntent,
      last_payment_error: null,
    })
    .eq("id", orderId)
    .in("status", ["awaiting_payment", "processing"])
    .select()
    .maybeSingle<OrderRow>();
  if (error) fail("Could not mark the order as paid", error);
  if (data) return { order: data, transitioned: true };

  const existing = await getOrderById(orderId);
  return { order: existing, transitioned: false };
}

/** The customer finished checkout with a payment method that settles later (e.g. SEPA debit). */
export async function markOrderProcessing(orderId: string, paymentIntent: string | null) {
  const { error } = await requireDb()
    .from("orders")
    .update({ status: "processing", processing_at: new Date().toISOString(), stripe_payment_intent: paymentIntent })
    .eq("id", orderId)
    .eq("status", "awaiting_payment");
  if (error) fail("Could not mark the order as processing", error);
}

/** A delayed payment did not go through. Paid orders are never moved back. */
export async function markPaymentFailed(orderId: string, reason: string | null) {
  const { error } = await requireDb()
    .from("orders")
    .update({ status: "payment_failed", payment_failed_at: new Date().toISOString(), last_payment_error: reason })
    .eq("id", orderId)
    .in("status", ["awaiting_payment", "processing"]);
  if (error) fail("Could not mark the payment as failed", error);
}

/** A card was declined. The checkout stays open, so the customer can try another one. */
export async function recordPaymentError(ref: string, reason: string) {
  const { error } = await requireDb()
    .from("orders")
    .update({ last_payment_error: reason.slice(0, 300) })
    .eq("ref", ref)
    .eq("status", "awaiting_payment");
  if (error) fail("Could not record the payment error", error);
}

/** Marks a paid order as refunded. Returns the order only when this call changed it. */
export async function markOrderRefunded(paymentIntent: string): Promise<OrderRow | null> {
  const { data, error } = await requireDb()
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("stripe_payment_intent", paymentIntent)
    .eq("status", "paid")
    .select()
    .maybeSingle<OrderRow>();
  if (error) fail("Could not mark the order as refunded", error);
  return data;
}

export async function updateOrder(orderId: string, values: Partial<OrderRow>) {
  const { error } = await requireDb().from("orders").update(values).eq("id", orderId);
  if (error) fail("Could not update the order", error);
}

async function findOrder(column: "id" | "ref" | "stripe_session_id" | "tracking_token" | "checkout_key", value: string) {
  const { data, error } = await requireDb().from("orders").select().eq(column, value).maybeSingle<OrderRow>();
  if (error) fail("Could not read the order", error);
  return data;
}

export const getOrderById = (id: string) => findOrder("id", id);
export const getOrderByRef = (ref: string) => findOrder("ref", ref);
export const getOrderBySession = (sessionId: string) => findOrder("stripe_session_id", sessionId);
export const getOrderByTrackingToken = (token: string) => findOrder("tracking_token", token);

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const { data, error } = await requireDb().from("order_items").select().eq("order_id", orderId).order("name");
  if (error) fail("Could not read the order lines", error);
  return (data ?? []) as OrderItemRow[];
}

export async function getShipment(orderId: string): Promise<ShipmentRow | null> {
  const { data, error } = await requireDb()
    .from("shipments")
    .select()
    .eq("order_id", orderId)
    .maybeSingle<ShipmentRow>();
  if (error) fail("Could not read the shipment", error);
  return data;
}

/** The tracking link is only handed out when the order number and the email both match. */
export async function findTrackingToken(ref: string, email: string): Promise<string | null> {
  const order = await getOrderByRef(ref);
  if (!order?.customer_email) return null;
  return order.customer_email.trim().toLowerCase() === email.trim().toLowerCase() ? order.tracking_token : null;
}

export type TrackingView = {
  order: Pick<OrderRow, "ref" | "status" | "created_at" | "paid_at" | "delivery_service"> & {
    postcode: string | null;
    city: string | null;
  };
  items: Pick<OrderItemRow, "name" | "quantity">[];
  shipment: Pick<
    ShipmentRow,
    | "status"
    | "request_status"
    | "carrier"
    | "tracking_number"
    | "tracking_url"
    | "estimated_delivery"
    | "next_attempt_on"
    | "received_confirmed_at"
  > | null;
  events: Pick<ShipmentEventRow, "id" | "status" | "description" | "location" | "occurred_at">[];
};

/** Everything the tracking page shows, and nothing more: no email, phone or street address. */
export async function getTrackingView(token: string): Promise<TrackingView | null> {
  const order = await findOrder("tracking_token", token);
  if (!order) return null;

  const [items, shipment] = await Promise.all([getOrderItems(order.id), getShipment(order.id)]);

  let events: TrackingView["events"] = [];
  if (shipment) {
    const { data, error } = await requireDb()
      .from("shipment_events")
      .select("id, status, description, location, occurred_at")
      .eq("shipment_id", shipment.id)
      .order("occurred_at", { ascending: false })
      .order("received_at", { ascending: false });
    if (error) fail("Could not read the delivery history", error);
    events = (data ?? []) as TrackingView["events"];
  }

  return {
    order: {
      ref: order.ref,
      status: order.status,
      created_at: order.created_at,
      paid_at: order.paid_at,
      delivery_service: order.delivery_service,
      postcode: order.shipping_address?.postcode ?? null,
      city: order.shipping_address?.city ?? null,
    },
    items: items.map(({ name, quantity }) => ({ name, quantity })),
    shipment: shipment && {
      status: shipment.status,
      request_status: shipment.request_status,
      carrier: shipment.carrier,
      tracking_number: shipment.tracking_number,
      tracking_url: shipment.tracking_url,
      estimated_delivery: shipment.estimated_delivery,
      next_attempt_on: shipment.next_attempt_on,
      received_confirmed_at: shipment.received_confirmed_at,
    },
    events,
  };
}

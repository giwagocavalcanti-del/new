import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TrackingParams } from "@/lib/attribution-params";
import type { DeliveryStatus, PartnerStatus } from "@/lib/delivery-status";

// Server-only access to the shop database (Supabase). The secret key bypasses
// row level security, so nothing in this folder may be imported by browser code.

let client: SupabaseClient | null = null;

/** The database client, or null while the shop has no database configured. */
export function db(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export class DatabaseError extends Error {}

/** For code that only runs once the caller has checked the database is configured. */
export function requireDb(): SupabaseClient {
  const database = db();
  if (!database) throw new DatabaseError("The shop database is not configured");
  return database;
}

export type OrderStatus = "awaiting_payment" | "processing" | "paid" | "payment_failed" | "cancelled" | "refunded";

export type Address = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
};

export type OrderRow = {
  id: string;
  ref: string;
  tracking_token: string;
  status: OrderStatus;
  currency: string;
  subtotal_pence: number;
  delivery_pence: number | null;
  total_pence: number | null;
  gateway_fee_pence: number | null;
  delivery_service: string | null;
  /** How the customer paid, as shown to them ("Visa •••• 4242"); null until Stripe confirms the payment. */
  payment_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: Address | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  attribution_consent: boolean;
  tracking_params: TrackingParams | null;
  utmify_synced_status: string | null;
  confirmation_email_sent_at: string | null;
  checkout_key: string | null;
  checkout_fingerprint: string | null;
  delivery_option_id: string | null;
  last_payment_error: string | null;
  stock_taken_at: string | null;
  stock_shortfall: { slug: string; ordered: number; available: number }[] | null;
  is_test: boolean;
  created_at: string;
  processing_at: string | null;
  paid_at: string | null;
  payment_failed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  slug: string;
  name: string;
  quantity: number;
  unit_pence: number;
  /** Single-panel price when the order was placed; above `unit_pence` when a quantity price applied. Null on older orders. */
  list_unit_pence: number | null;
  total_pence: number;
  height_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  weight_kg: number | null;
};

export type ShipmentRow = {
  id: string;
  order_id: string;
  status: DeliveryStatus;
  request_status: "pending" | "requesting" | "accepted" | "failed" | "not_configured";
  request_attempts: number;
  request_error: string | null;
  requested_at: string | null;
  partner: string | null;
  partner_shipment_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_delivery: string | null;
  /** Next delivery attempt, as reported by the carrier or staff. */
  next_attempt_on: string | null;
  /** When the customer confirmed receipt on the tracking page. */
  received_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentEventRow = {
  id: string;
  shipment_id: string;
  source: string;
  external_id: string;
  status: PartnerStatus;
  description: string | null;
  location: string | null;
  occurred_at: string;
  received_at: string;
};

export type EmailKind = "confirmation" | "dispatched" | "out_for_delivery" | "delivered";
export type EmailStatus = "sending" | "sent" | "failed" | "rejected" | "skipped";

export type EmailMessageRow = {
  id: string;
  order_id: string;
  kind: EmailKind;
  status: EmailStatus;
  recipient: string | null;
  attempts: number;
  last_error: string | null;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type ShipmentAuditRow = {
  id: number;
  shipment_id: string;
  actor: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
};

/** Records a call to an outside service. Never throws: logging must not break an order. */
export async function logCall(entry: {
  orderId: string | null;
  target: "utmify" | "delivery_partner" | "stripe" | "email" | "stock";
  action: string;
  ok: boolean;
  httpStatus?: number | null;
  detail?: string | null;
}) {
  try {
    await db()
      ?.from("integration_log")
      .insert({
        order_id: entry.orderId,
        target: entry.target,
        action: entry.action,
        ok: entry.ok,
        http_status: entry.httpStatus ?? null,
        detail: entry.detail?.slice(0, 2000) ?? null,
      });
  } catch (error) {
    console.error("Could not write to integration_log", error);
  }
}

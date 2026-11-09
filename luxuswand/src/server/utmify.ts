import { site } from "@/config/site";
import { TRACKING_KEYS } from "@/lib/attribution-params";
import { logCall, requireDb, type OrderItemRow, type OrderRow } from "@/server/db";
import { postJson } from "@/server/http";
import { getOrderItems, updateOrder } from "@/server/orders";

// Reports paid and refunded orders to UTMify, following
// https://docs.utmify.com.br/send-orders

const DEFAULT_URL = "https://api.utmify.com.br/api-credentials/orders";
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTMify wants UTC as "YYYY-MM-DD HH:MM:SS". */
const utcStamp = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 19).replace("T", " ") : null);

const utmifyStatus = (order: OrderRow) =>
  order.status === "paid" ? "paid" : order.status === "refunded" ? "refunded" : null;

function mayShare(order: OrderRow) {
  if (!site.attribution.enabled) return false;
  return order.attribution_consent || site.attribution.shareOrdersWithoutConsent;
}

/** The request body. Personal data is kept to what UTMify requires: name, email and country. */
export function utmifyPayload(order: OrderRow, items: OrderItemRow[]) {
  const total = order.total_pence ?? order.subtotal_pence;
  const fee = order.gateway_fee_pence ?? 0;
  const params = order.attribution_consent ? order.tracking_params : null;

  return {
    orderId: order.ref,
    platform: site.name.replace(/[^A-Za-z0-9]/g, ""),
    paymentMethod: "credit_card",
    status: utmifyStatus(order),
    createdAt: utcStamp(order.created_at),
    approvedDate: utcStamp(order.paid_at),
    refundedAt: utcStamp(order.refunded_at),
    customer: {
      name: order.customer_name ?? "",
      email: order.customer_email ?? "",
      phone: null,
      document: null,
      country: order.shipping_address?.country ?? undefined,
    },
    products: items.map((item) => ({
      id: item.slug,
      name: item.name,
      planId: null,
      planName: null,
      quantity: item.quantity,
      priceInCents: item.unit_pence,
    })),
    trackingParameters: Object.fromEntries(TRACKING_KEYS.map((key) => [key, params?.[key] ?? null])),
    commission: {
      totalPriceInCents: total,
      gatewayFeeInCents: fee,
      userCommissionInCents: total - fee,
      currency: order.currency.toUpperCase(),
    },
    // UTMify validates a test order but does not save it.
    isTest: order.is_test,
  };
}

/**
 * Sends the order's current status to UTMify when it has not been sent yet.
 * Skips quietly when UTMify is not configured or the customer did not agree.
 */
export async function syncOrderToUtmify(order: OrderRow, items?: OrderItemRow[]): Promise<"sent" | "skipped" | "failed"> {
  const token = process.env.UTMIFY_API_TOKEN;
  const status = utmifyStatus(order);
  if (!token || !status || !mayShare(order) || order.utmify_synced_status === status) return "skipped";
  if (!order.customer_name || !order.customer_email) return "skipped";

  const reply = await postJson(process.env.UTMIFY_API_URL ?? DEFAULT_URL, {
    headers: { "x-api-token": token },
    body: utmifyPayload(order, items ?? (await getOrderItems(order.id))),
    timeoutMs: 6000,
  });

  await logCall({
    orderId: order.id,
    target: "utmify",
    action: `order.${status}`,
    ok: reply.ok,
    httpStatus: reply.status,
    detail: reply.ok ? null : reply.text.slice(0, 500),
  });

  if (!reply.ok) return "failed";
  await updateOrder(order.id, { utmify_synced_status: status });
  return "sent";
}

/** Sends again whatever UTMify has not received, inside the age limits its API accepts. */
export async function retryUtmify() {
  if (!process.env.UTMIFY_API_TOKEN || !site.attribution.enabled) return { tried: 0, sent: 0 };

  // UTMify accepts sales up to 7 days old and refunds up to 45 days old.
  const since = new Date(Date.now() - 45 * DAY_MS).toISOString();
  const { data, error } = await requireDb()
    .from("orders")
    .select()
    .in("status", ["paid", "refunded"])
    .gte("created_at", since)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`Could not list orders to report: ${error.message}`);

  const weekAgo = Date.now() - 7 * DAY_MS;
  const due = ((data ?? []) as OrderRow[])
    .filter((order) => order.utmify_synced_status !== order.status)
    .filter((order) => order.status === "refunded" || Date.parse(order.created_at) >= weekAgo)
    .slice(0, 25);

  let sent = 0;
  for (const order of due) if ((await syncOrderToUtmify(order)) === "sent") sent++;
  return { tried: due.length, sent };
}

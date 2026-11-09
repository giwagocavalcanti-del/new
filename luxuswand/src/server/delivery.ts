import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isPartnerStatus, SHIPPING_STATUSES, type PartnerStatus } from "@/lib/delivery-status";
import { logCall, requireDb, type OrderItemRow, type OrderRow, type ShipmentRow } from "@/server/db";
import { notifyShipment } from "@/server/email";
import { postJson } from "@/server/http";
import { getOrderById, getOrderByRef, getOrderItems, normaliseRef } from "@/server/orders";

// Both directions of the delivery partner API, described in docs/delivery-partner-api.md:
//   outbound – we ask the partner to create a shipment for a paid order;
//   inbound  – partners send us delivery updates.

const MAX_REQUEST_ATTEMPTS = 10;
const REQUEST_STALE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Outbound: asking the partner to create a shipment
// ---------------------------------------------------------------------------

function outboundPartner() {
  const url = process.env.DELIVERY_PARTNER_API_URL;
  const key = process.env.DELIVERY_PARTNER_API_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key, name: process.env.DELIVERY_PARTNER_NAME ?? "partner" };
}

const httpsUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

const isoDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;

const shortText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Creates the shipment record of a paid order if it does not exist yet. */
export async function ensureShipment(orderId: string): Promise<ShipmentRow> {
  const database = requireDb();
  await database.from("shipments").upsert({ order_id: orderId }, { onConflict: "order_id", ignoreDuplicates: true });
  const { data, error } = await database.from("shipments").select().eq("order_id", orderId).single<ShipmentRow>();
  if (error) throw new Error(`Could not read the shipment: ${error.message}`);
  return data;
}

async function updateShipment(id: string, values: Partial<ShipmentRow>) {
  const { data, error } = await requireDb()
    .from("shipments")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single<ShipmentRow>();
  if (error) throw new Error(`Could not update the shipment: ${error.message}`);
  return data;
}

/** Updates can arrive out of order: the shipment follows the most recent one by its own time. */
async function latestEventStatus(shipmentId: string): Promise<PartnerStatus> {
  const { data, error } = await requireDb()
    .from("shipment_events")
    .select("status")
    .eq("shipment_id", shipmentId)
    .order("occurred_at", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(1)
    .single<{ status: PartnerStatus }>();
  if (error) throw new Error(error.message);
  return data.status;
}

/** The next-attempt date only means something while the parcel waits for another try. */
function nextAttemptAfter(status: PartnerStatus, reported: string | null, previous: string | null) {
  if (status !== "delivery_attempted" && status !== "back_at_depot") return null;
  return reported ?? previous;
}

/** The body we send to the partner. Kept in one place so the documentation can mirror it. */
export function shipmentRequestBody(order: OrderRow, items: OrderItemRow[], eventsUrl: string) {
  return {
    order_ref: order.ref,
    created_at: new Date(order.created_at).toISOString(),
    paid_at: order.paid_at && new Date(order.paid_at).toISOString(),
    test: order.is_test,
    service: order.delivery_service,
    recipient: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.shipping_address,
    },
    items: items.map((item) => ({
      sku: item.slug,
      name: item.name,
      quantity: item.quantity,
      height_mm: item.height_mm,
      width_mm: item.width_mm,
      depth_mm: item.depth_mm,
      weight_kg: item.weight_kg,
    })),
    goods_value: { amount_pence: order.subtotal_pence, currency: order.currency.toUpperCase() },
    events_url: eventsUrl,
  };
}

/**
 * Asks the partner to create the shipment. Does nothing when the partner has
 * already accepted it, so it is safe to call again after a failure.
 */
export async function requestShipment(
  order: OrderRow,
  items: OrderItemRow[],
  shipment: ShipmentRow,
  eventsUrl: string,
): Promise<ShipmentRow> {
  if (shipment.request_status === "accepted") return shipment;

  const partner = outboundPartner();
  if (!partner) {
    return shipment.request_status === "not_configured"
      ? shipment
      : updateShipment(shipment.id, { request_status: "not_configured" });
  }

  // Reserve the request first: of two webhooks arriving together, only one asks the partner.
  // A request that started long ago and never finished may be taken over.
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - REQUEST_STALE_MS).toISOString();
  const claimed = await requireDb()
    .from("shipments")
    .update({ request_status: "requesting", requested_at: now, updated_at: now })
    .eq("id", shipment.id)
    .or(`request_status.in.(pending,failed,not_configured),and(request_status.eq.requesting,requested_at.lt."${staleBefore}")`)
    .select()
    .maybeSingle<ShipmentRow>();
  if (claimed.error) throw new Error(`Could not reserve the shipment request: ${claimed.error.message}`);
  if (!claimed.data) {
    const current = await requireDb().from("shipments").select().eq("id", shipment.id).single<ShipmentRow>();
    return current.data ?? shipment;
  }
  shipment = claimed.data;

  const reply = await postJson(`${partner.url}/shipments`, {
    headers: { authorization: `Bearer ${partner.key}`, "idempotency-key": order.ref },
    body: shipmentRequestBody(order, items, eventsUrl),
    timeoutMs: 8000,
  });

  const answer = (reply.json && typeof reply.json === "object" ? reply.json : {}) as Record<string, unknown>;
  const partnerShipmentId = shortText(answer.shipment_id, 200);
  const accepted = reply.ok && partnerShipmentId !== null;
  const problem = accepted
    ? null
    : reply.ok
      ? "The partner answered without a shipment_id"
      : `HTTP ${reply.status ?? "no answer"}: ${reply.text.slice(0, 500)}`;

  await logCall({
    orderId: order.id,
    target: "delivery_partner",
    action: "shipment.create",
    ok: accepted,
    httpStatus: reply.status,
    detail: problem,
  });

  // A 4xx answer means the partner refused this order as it is: asking again
  // would get the same answer, so it is left for a person to look at.
  const refused = reply.status !== null && reply.status >= 400 && reply.status < 500 && ![408, 429].includes(reply.status);
  const attempt = {
    request_attempts: refused ? MAX_REQUEST_ATTEMPTS : shipment.request_attempts + 1,
    requested_at: new Date().toISOString(),
  };
  if (!accepted) {
    return updateShipment(shipment.id, { ...attempt, request_status: "failed", request_error: problem });
  }

  return updateShipment(shipment.id, {
    ...attempt,
    request_status: "accepted",
    request_error: null,
    partner: partner.name,
    partner_shipment_id: partnerShipmentId,
    status: isPartnerStatus(answer.status) ? answer.status : shipment.status,
    carrier: shortText(answer.carrier, 100),
    tracking_number: shortText(answer.tracking_number, 100),
    tracking_url: httpsUrl(answer.tracking_url),
    estimated_delivery: isoDate(answer.estimated_delivery),
  });
}

/** Tries again every shipment the partner has not accepted yet. */
export async function retryShipments(eventsUrl: string) {
  const { data, error } = await requireDb()
    .from("shipments")
    .select()
    .in("request_status", ["pending", "requesting", "failed", "not_configured"])
    .lt("request_attempts", MAX_REQUEST_ATTEMPTS)
    .order("created_at")
    .limit(25);
  if (error) throw new Error(`Could not list shipments to retry: ${error.message}`);

  let accepted = 0;
  const shipments = (data ?? []) as ShipmentRow[];
  for (const shipment of shipments) {
    const order = await getOrderById(shipment.order_id);
    if (order?.status !== "paid") continue;
    const result = await requestShipment(order, await getOrderItems(order.id), shipment, eventsUrl);
    if (result.request_status === "accepted") accepted++;
  }
  return { tried: shipments.length, accepted };
}

// ---------------------------------------------------------------------------
// Inbound: delivery updates sent by partners
// ---------------------------------------------------------------------------

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Checks the bearer key of a partner request against DELIVERY_API_KEYS
 * ("name:key,other:key") and returns the partner's name, or null.
 */
export function authenticatePartner(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given) return null;

  let match: string | null = null;
  for (const entry of (process.env.DELIVERY_API_KEYS ?? "").split(",")) {
    const separator = entry.indexOf(":");
    if (separator < 1) continue;
    const name = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    // Every key is compared, in constant time, so timing reveals nothing about them.
    if (key && timingSafeEqual(digest(key), digest(given))) match = name;
  }
  return match;
}

export const hasInboundPartners = () => (process.env.DELIVERY_API_KEYS ?? "").includes(":");

export type FieldError = { field: string; message: string };

type DeliveryEvent = {
  eventId: string;
  orderRef: string | null;
  shipmentId: string | null;
  status: PartnerStatus;
  occurredAt: string;
  description: string | null;
  location: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  nextAttemptDate: string | null;
};

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Checks a partner's update field by field, so the answer can say exactly what is wrong. */
export function parseDeliveryEvent(input: unknown): { event: DeliveryEvent } | { errors: FieldError[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { errors: [{ field: "(body)", message: "must be a JSON object" }] };
  }
  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  const optional = (field: string, max: number) => {
    const value = body[field];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > max) {
      errors.push({ field, message: `must be a string of at most ${max} characters` });
      return null;
    }
    return value.trim() || null;
  };

  const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (!eventId || eventId.length > 200) {
    errors.push({ field: "event_id", message: "is required: a unique string of at most 200 characters" });
  }

  const rawRef = optional("order_ref", 40);
  const orderRef = rawRef ? normaliseRef(rawRef) : null;
  if (rawRef && !orderRef) errors.push({ field: "order_ref", message: "is not a valid order number" });
  const shipmentId = optional("shipment_id", 200);
  if (!rawRef && !shipmentId) {
    errors.push({ field: "order_ref", message: "send order_ref, shipment_id, or both" });
  }

  if (!isPartnerStatus(body.status)) {
    errors.push({ field: "status", message: "is required and must be one of the documented statuses" });
  }

  const occurredAt = typeof body.occurred_at === "string" ? body.occurred_at : "";
  if (!TIMESTAMP.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    errors.push({
      field: "occurred_at",
      message: "is required: ISO 8601 with a time zone, for example 2026-10-14T09:30:00Z",
    });
  }

  const trackingUrl = optional("tracking_url", 500);
  if (trackingUrl && !httpsUrl(trackingUrl)) {
    errors.push({ field: "tracking_url", message: "must be an https:// address" });
  }
  const estimatedDelivery = optional("estimated_delivery", 10);
  if (estimatedDelivery && !isoDate(estimatedDelivery)) {
    errors.push({ field: "estimated_delivery", message: "must be a date in the form YYYY-MM-DD" });
  }
  const nextAttemptDate = optional("next_attempt_date", 10);
  if (nextAttemptDate && !isoDate(nextAttemptDate)) {
    errors.push({ field: "next_attempt_date", message: "must be a date in the form YYYY-MM-DD" });
  }

  const event: DeliveryEvent = {
    eventId,
    orderRef,
    shipmentId,
    status: body.status as PartnerStatus,
    occurredAt,
    description: optional("description", 500),
    location: optional("location", 200),
    carrier: optional("carrier", 100),
    trackingNumber: optional("tracking_number", 100),
    trackingUrl,
    estimatedDelivery,
    nextAttemptDate,
  };

  return errors.length ? { errors } : { event };
}

export type RecordResult =
  | { outcome: "recorded" | "duplicate"; orderRef: string; shipmentStatus: string }
  | { outcome: "shipment_not_found" | "order_not_ready" | "order_not_shippable" | "forbidden" };

/**
 * Stores a delivery update, brings the shipment up to date with the latest one
 * and sends the customer the email that fits, if any.
 */
export async function recordDeliveryEvent(
  partner: string,
  event: DeliveryEvent,
  raw: unknown,
  origin: string,
): Promise<RecordResult> {
  const database = requireDb();

  let shipment: ShipmentRow | null = null;
  let orderRef = event.orderRef;

  if (event.orderRef) {
    const order = await getOrderByRef(event.orderRef);
    if (!order) return { outcome: "shipment_not_found" };
    const found = await database.from("shipments").select().eq("order_id", order.id).maybeSingle<ShipmentRow>();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) return { outcome: "order_not_ready" };
    shipment = found.data;
  } else if (event.shipmentId) {
    const found = await database
      .from("shipments")
      .select()
      .eq("partner", partner)
      .eq("partner_shipment_id", event.shipmentId)
      .maybeSingle<ShipmentRow>();
    if (found.error) throw new Error(found.error.message);
    shipment = found.data;
  }
  if (!shipment) return { outcome: "shipment_not_found" };

  // A shipment handled by one partner cannot be changed by another.
  if (shipment.partner && shipment.partner !== partner) return { outcome: "forbidden" };

  const order = await getOrderById(shipment.order_id);
  if (!order) return { outcome: "shipment_not_found" };
  orderRef ??= order.ref;
  // A refunded or cancelled order must not go out. Returns and cancellations are still recorded.
  if (order.status !== "paid" && SHIPPING_STATUSES.has(event.status)) return { outcome: "order_not_shippable" };

  const inserted = await database
    .from("shipment_events")
    .upsert(
      {
        shipment_id: shipment.id,
        source: partner,
        external_id: event.eventId,
        status: event.status,
        description: event.description,
        location: event.location,
        occurred_at: event.occurredAt,
        payload: raw,
      },
      { onConflict: "source,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (inserted.error) throw new Error(inserted.error.message);
  if (!inserted.data?.length) return { outcome: "duplicate", orderRef, shipmentStatus: shipment.status };

  const status = await latestEventStatus(shipment.id);
  const updated = await updateShipment(shipment.id, {
    status,
    partner: shipment.partner ?? partner,
    partner_shipment_id: shipment.partner_shipment_id ?? event.shipmentId,
    carrier: event.carrier ?? shipment.carrier,
    tracking_number: event.trackingNumber ?? shipment.tracking_number,
    tracking_url: event.trackingUrl ?? shipment.tracking_url,
    estimated_delivery: event.estimatedDelivery ?? shipment.estimated_delivery,
    next_attempt_on: nextAttemptAfter(status, event.nextAttemptDate, shipment.next_attempt_on),
  });

  // The email must never make the partner think the update was lost.
  await notifyShipment(order, updated, origin, true).catch((error) => console.error("Shipment email failed", error));

  return { outcome: "recorded", orderRef, shipmentStatus: updated.status };
}

// ---------------------------------------------------------------------------
// Staff: entering the carrier, tracking number and status by hand
// ---------------------------------------------------------------------------

export type StaffShipmentInput = {
  status: PartnerStatus | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  nextAttemptOn: string | null;
  note: string | null;
};

/** Checks what staff typed. Messages are in Portuguese, for the shop owner. */
export function parseStaffShipment(form: FormData): { input: StaffShipmentInput } | { error: string } {
  const value = (name: string, max: number) => {
    const raw = form.get(name);
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : null;
  };
  const rawStatus = value("status", 40);
  if (rawStatus && !isPartnerStatus(rawStatus)) return { error: "Status desconhecido." };
  const trackingUrl = value("tracking_url", 500);
  if (trackingUrl && !httpsUrl(trackingUrl)) return { error: "O link de rastreio precisa começar com https://." };
  const estimatedDelivery = value("estimated_delivery", 10);
  if (estimatedDelivery && !isoDate(estimatedDelivery)) return { error: "A previsão de entrega precisa ser uma data válida." };
  const nextAttemptOn = value("next_attempt_on", 10);
  if (nextAttemptOn && !isoDate(nextAttemptOn)) return { error: "A data da nova tentativa precisa ser uma data válida." };
  return {
    input: {
      status: (rawStatus as PartnerStatus | null) ?? null,
      carrier: value("carrier", 100),
      trackingNumber: value("tracking_number", 100),
      trackingUrl,
      estimatedDelivery,
      nextAttemptOn,
      note: value("note", 300),
    },
  };
}

export type StaffResult = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * Saves what staff entered. Every change is kept in shipment_audit with who
 * made it; a new status also becomes an entry in the customer's delivery
 * history. Then the dispatch email goes out if it is due.
 */
export async function staffUpdateShipment(
  order: OrderRow,
  actor: string,
  input: StaffShipmentInput,
  origin: string,
): Promise<StaffResult> {
  if (order.status !== "paid") return { ok: false, error: "Só pedidos pagos podem ser enviados." };
  const shipment = await ensureShipment(order.id);

  const next = {
    carrier: input.carrier,
    tracking_number: input.trackingNumber,
    tracking_url: input.trackingUrl,
    estimated_delivery: input.estimatedDelivery,
    next_attempt_on: input.nextAttemptOn,
  };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(next)) {
    const from = shipment[key as keyof typeof next];
    if ((from ?? null) !== (to ?? null)) changes[key] = { from, to };
  }
  const newStatus = input.status && input.status !== shipment.status ? input.status : null;
  if (newStatus) changes.status = { from: shipment.status, to: newStatus };
  if (input.note) changes.note = { from: null, to: input.note };
  if (Object.keys(changes).length === 0) return { ok: true, changed: false };

  const database = requireDb();
  const audit = await database.from("shipment_audit").insert({ shipment_id: shipment.id, actor, changes });
  if (audit.error) throw new Error(`Could not save the change history: ${audit.error.message}`);

  if (newStatus || input.note) {
    const event = await database.from("shipment_events").insert({
      shipment_id: shipment.id,
      source: "staff",
      external_id: randomUUID(),
      status: newStatus ?? (shipment.status === "pending" ? "preparing" : shipment.status),
      description: input.note,
      location: null,
      occurred_at: new Date().toISOString(),
      payload: { actor },
    });
    if (event.error) throw new Error(`Could not save the delivery update: ${event.error.message}`);
  }

  const updated = await updateShipment(shipment.id, {
    ...next,
    ...(newStatus ? { status: newStatus } : shipment.status === "pending" && input.note ? { status: "preparing" as const } : {}),
  });

  await notifyShipment(order, updated, origin, false).catch((error) => console.error("Shipment email failed", error));
  return { ok: true, changed: true };
}

/** What staff changed on a shipment, newest first. */
export async function shipmentAuditOf(shipmentId: string) {
  const { data, error } = await requireDb()
    .from("shipment_audit")
    .select()
    .eq("shipment_id", shipmentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not read the change history: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Customer: confirming receipt on the tracking page
// ---------------------------------------------------------------------------

export type ReceiptResult = "confirmed" | "already_confirmed" | "not_shippable";

/**
 * The customer says the parcel arrived. This ends the timeline. Pressing the
 * button twice, or two tabs at once, keeps one confirmation and one entry in
 * the delivery history. No email: the customer already knows.
 */
export async function confirmReceipt(order: OrderRow): Promise<ReceiptResult> {
  if (order.status !== "paid") return "not_shippable";
  const shipment = await ensureShipment(order.id);
  if (shipment.status === "returned" || shipment.status === "cancelled") return "not_shippable";
  if (shipment.received_confirmed_at) return "already_confirmed";

  const database = requireDb();
  const now = new Date().toISOString();
  const claimed = await database
    .from("shipments")
    .update({ received_confirmed_at: now, updated_at: now })
    .eq("id", shipment.id)
    .is("received_confirmed_at", null)
    .select("id");
  if (claimed.error) throw new Error(`Could not save the confirmation: ${claimed.error.message}`);
  if (!claimed.data?.length) return "already_confirmed";

  const event = await database.from("shipment_events").upsert(
    {
      shipment_id: shipment.id,
      source: "customer",
      external_id: `received:${shipment.id}`,
      status: "delivered",
      description: "Empfang von dir bestätigt",
      location: null,
      occurred_at: now,
      payload: { via: "tracking_page" },
    },
    { onConflict: "source,external_id", ignoreDuplicates: true },
  );
  if (event.error) throw new Error(`Could not save the delivery update: ${event.error.message}`);

  const audit = await database
    .from("shipment_audit")
    .insert({ shipment_id: shipment.id, actor: "Cliente (página de rastreio)", changes: { received_confirmed_at: { from: null, to: now } } });
  if (audit.error) throw new Error(`Could not save the change history: ${audit.error.message}`);

  const status = await latestEventStatus(shipment.id);
  await updateShipment(shipment.id, { status, next_attempt_on: nextAttemptAfter(status, null, shipment.next_attempt_on) });
  return "confirmed";
}

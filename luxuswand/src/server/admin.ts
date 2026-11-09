import { site } from "@/config/site";
import { buildTimeline } from "@/lib/order-timeline";
import { requireDb, type OrderRow, type ShipmentEventRow, type ShipmentRow } from "@/server/db";
import { shipmentAuditOf } from "@/server/delivery";
import { emailMessagesOf } from "@/server/email";
import { getOrderByRef, getOrderItems, getShipment } from "@/server/orders";

// What the staff pages read. Only for signed-in staff: it includes the
// customer's contact details and address.

export type OrderFilter = "to_ship" | "shipped" | "unpaid" | "all";

export type OrderListRow = Pick<
  OrderRow,
  "id" | "ref" | "status" | "created_at" | "paid_at" | "total_pence" | "customer_name" | "customer_email" | "is_test" | "stock_shortfall"
> & {
  shipment: Pick<ShipmentRow, "id" | "status" | "tracking_number" | "request_status" | "received_confirmed_at" | "next_attempt_on"> | null;
  /** Out for delivery for a while with no result and no confirmation: staff should ask the carrier. */
  needsCheck: boolean;
};

export async function listOrders(filter: OrderFilter): Promise<OrderListRow[]> {
  let query = requireDb()
    .from("orders")
    .select(
      "id, ref, status, created_at, paid_at, total_pence, customer_name, customer_email, is_test, stock_shortfall, shipment:shipments(id, status, tracking_number, request_status, received_confirmed_at, next_attempt_on)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter === "to_ship" || filter === "shipped") query = query.eq("status", "paid");
  if (filter === "unpaid") query = query.in("status", ["awaiting_payment", "processing", "payment_failed", "cancelled"]);

  const { data, error } = await query;
  if (error) throw new Error(`Could not list the orders: ${error.message}`);
  const raw = ((data ?? []) as unknown as (Omit<OrderListRow, "shipment" | "needsCheck"> & { shipment: OrderListRow["shipment"] | OrderListRow["shipment"][] })[]).map(
    (row) => ({ ...row, shipment: Array.isArray(row.shipment) ? (row.shipment[0] ?? null) : row.shipment }),
  );

  // Same timeline as the customer sees, to flag deliveries nobody has confirmed.
  const shipmentIds = raw.flatMap((row) => (row.status === "paid" && row.shipment ? [row.shipment.id] : []));
  const eventsByShipment = new Map<string, { status: string; occurred_at: string }[]>();
  if (shipmentIds.length) {
    const found = await requireDb().from("shipment_events").select("shipment_id, status, occurred_at").in("shipment_id", shipmentIds);
    if (found.error) throw new Error(`Could not read the delivery history: ${found.error.message}`);
    for (const event of (found.data ?? []) as { shipment_id: string; status: string; occurred_at: string }[]) {
      eventsByShipment.set(event.shipment_id, [...(eventsByShipment.get(event.shipment_id) ?? []), event]);
    }
  }
  const now = new Date();
  const rows: OrderListRow[] = raw.map((row) => ({
    ...row,
    needsCheck:
      row.status === "paid" &&
      buildTimeline({
        paidAt: row.paid_at ?? row.created_at,
        now,
        events: (row.shipment && eventsByShipment.get(row.shipment.id)) ?? [],
        receivedConfirmedAt: row.shipment?.received_confirmed_at ?? null,
        nextAttemptOn: row.shipment?.next_attempt_on ?? null,
        config: site.tracking,
      }).checking,
  }));

  const waiting = (row: OrderListRow) => !row.shipment || row.shipment.status === "pending" || row.shipment.status === "preparing";
  if (filter === "to_ship") return rows.filter(waiting);
  if (filter === "shipped") return rows.filter((row) => !waiting(row));
  return rows;
}

export async function orderDetail(ref: string) {
  const order = await getOrderByRef(ref);
  if (!order) return null;
  const [items, shipment, emails, log] = await Promise.all([
    getOrderItems(order.id),
    getShipment(order.id),
    emailMessagesOf(order.id),
    requireDb()
      .from("integration_log")
      .select("target, action, ok, http_status, detail, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  let events: ShipmentEventRow[] = [];
  let audit: Awaited<ReturnType<typeof shipmentAuditOf>> = [];
  if (shipment) {
    const [found, changes] = await Promise.all([
      requireDb()
        .from("shipment_events")
        .select("id, shipment_id, source, external_id, status, description, location, occurred_at, received_at")
        .eq("shipment_id", shipment.id)
        .order("occurred_at", { ascending: false }),
      shipmentAuditOf(shipment.id),
    ]);
    if (found.error) throw new Error(`Could not read the delivery history: ${found.error.message}`);
    events = (found.data ?? []) as ShipmentEventRow[];
    audit = changes;
  }

  return {
    order,
    items,
    shipment,
    events,
    audit,
    emails,
    log: (log.data ?? []) as { target: string; action: string; ok: boolean; http_status: number | null; detail: string | null; created_at: string }[],
  };
}

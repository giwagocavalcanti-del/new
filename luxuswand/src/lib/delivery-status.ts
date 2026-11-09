// The delivery vocabulary, shared by the partner API, the database and the tracking page.

/** Statuses a delivery partner may report. */
export const PARTNER_STATUSES = [
  "preparing",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_attempted",
  "back_at_depot",
  "exception",
  "returned",
  "cancelled",
] as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** `pending` is ours alone: the order is paid and no partner has reported anything yet. */
export type DeliveryStatus = "pending" | PartnerStatus;

export function isPartnerStatus(value: unknown): value is PartnerStatus {
  return typeof value === "string" && (PARTNER_STATUSES as readonly string[]).includes(value);
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Bestellung eingegangen",
  preparing: "Wird vorbereitet",
  dispatched: "Versandt",
  in_transit: "Unterwegs",
  out_for_delivery: "In Zustellung",
  delivered: "Zugestellt",
  delivery_attempted: "Zustellung nicht möglich",
  back_at_depot: "Zurück im Logistikzentrum",
  exception: "Verzögert",
  returned: "Zurück an den Absender",
  cancelled: "Zustellung storniert",
};

/** The steps of the progress bar on the tracking page. */
export const STAGES = ["Bestellung bestätigt", "Wird vorbereitet", "Unterwegs", "In Zustellung", "Zugestellt"] as const;

const STAGE_OF: Partial<Record<DeliveryStatus, number>> = {
  pending: 0,
  preparing: 1,
  dispatched: 2,
  in_transit: 2,
  out_for_delivery: 3,
  delivery_attempted: 3,
  back_at_depot: 3,
  delivered: 4,
};

/** Furthest step reached, judging by every status seen so far. */
export function stageReached(statuses: DeliveryStatus[]) {
  return Math.max(0, ...statuses.map((status) => STAGE_OF[status] ?? 0));
}

/**
 * Statuses that mean something went wrong and the customer should be told plainly.
 * A failed attempt and the parcel back at the depot are explained by the timeline itself.
 */
export const PROBLEM_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  "exception",
  "returned",
  "cancelled",
]);

/** Statuses that mean the parcel is being sent: refused for orders that were refunded or cancelled. */
export const SHIPPING_STATUSES: ReadonlySet<PartnerStatus> = new Set([
  "preparing",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_attempted",
  "back_at_depot",
]);

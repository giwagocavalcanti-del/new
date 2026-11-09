# Delivery Partner API

Version 1. This document is for the company that stores, ships or delivers our orders. It describes two things:

1. **What you call on our side** to send us delivery updates (section 2).
2. **What we call on your side** to ask you to create a shipment when an order is paid (section 3).

Everything is JSON over HTTPS. All timestamps are ISO 8601 with a time zone, for example `2026-10-14T09:30:00Z`.

`{SHOP}` below is the shop's public address, sent to you during onboarding (for example `https://www.example.de`).

---

## 1. Authentication

Each direction has its own secret key, sent as a bearer token:

```
Authorization: Bearer <key>
```

| Direction | Who issues the key | Used for |
|---|---|---|
| You → us | We give you one key per partner | Section 2 |
| Us → you | You give us a key | Section 3 |

Keys must be kept secret and are only ever sent over HTTPS. If a key leaks, tell us and it is replaced.

To check that your key works:

```
GET {SHOP}/api/v1/delivery/ping
Authorization: Bearer <your key>
```

```json
{ "ok": true, "partner": "your-name" }
```

---

## 2. Sending us delivery updates

```
POST {SHOP}/api/v1/delivery/events
Authorization: Bearer <your key>
Content-Type: application/json
```

Send **one update per request**, each time something happens to a parcel.

### Body

| Field | Type | Required | Description |
|---|---|---|---|
| `event_id` | string, max 200 | yes | Your own unique id for this update. Sending the same `event_id` again is safe and changes nothing. |
| `order_ref` | string | one of the two | Our order number, for example `7KQ4-M2XP`. Case, spaces and the dash are ignored. |
| `shipment_id` | string, max 200 | one of the two | Your own shipment id, as returned to us in section 3. |
| `status` | string | yes | One of the statuses below. |
| `occurred_at` | timestamp | yes | When it happened (not when you are sending it). |
| `description` | string, max 500 | no | Short text shown to the customer, for example `Arrived at Leipzig depot`. |
| `location` | string, max 200 | no | Where it happened, shown to the customer. |
| `carrier` | string, max 100 | no | Courier name. Updates what the customer sees. |
| `tracking_number` | string, max 100 | no | Courier tracking number. |
| `tracking_url` | string, max 500 | no | Link to the courier's own tracking page. Must start with `https://`. |
| `estimated_delivery` | date `YYYY-MM-DD` | no | Expected delivery day. |
| `next_attempt_date` | date `YYYY-MM-DD` | no | With `delivery_attempted` or `back_at_depot`: the day of the next delivery attempt. Without it the customer sees our own forecast, marked as a forecast. Ignored with other statuses. |

Send `order_ref`, `shipment_id`, or both. When both are sent, `order_ref` is used to find the order.

### Statuses

| `status` | Meaning |
|---|---|
| `preparing` | Order received by the warehouse and being picked or packed. |
| `dispatched` | Handed to the courier. |
| `in_transit` | Moving through the courier network. |
| `out_for_delivery` | On the vehicle for delivery today. |
| `delivered` | Delivered to the customer. |
| `delivery_attempted` | Delivery was tried and failed (nobody in, access problem); the parcel is going back to your depot. |
| `back_at_depot` | After a failed attempt, the parcel is back at your depot and will go out again. Send `next_attempt_date` if you know it. The next try is a new `out_for_delivery`. |
| `exception` | A delay or problem. Explain it in `description`. |
| `returned` | Being returned, or returned, to the sender. |
| `cancelled` | The shipment was cancelled. |

Updates may arrive in any order. The customer always sees the one with the latest `occurred_at` as the current status, and the full history below it.

Only send what really happened. The shop never assumes a failed attempt or a return: if a parcel has been out for delivery for a few working days with no update from you and no confirmation from the customer, the tracking page only says that the shop is checking, and the shop will ask you. The customer can also confirm receipt on the tracking page; that ends the tracking for them, and your later updates are still recorded.

### Example

```bash
curl -X POST "{SHOP}/api/v1/delivery/events" \
  -H "Authorization: Bearer <your key>" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt-000123",
    "order_ref": "7KQ4-M2XP",
    "status": "out_for_delivery",
    "occurred_at": "2026-10-16T07:30:00+01:00",
    "description": "With driver",
    "location": "Leipzig depot",
    "carrier": "Example Couriers",
    "tracking_number": "EC1001DE",
    "tracking_url": "https://tracking.example.com/EC1001DE",
    "estimated_delivery": "2026-10-16"
  }'
```

### Responses

| HTTP | Body | Meaning | What to do |
|---|---|---|---|
| 200 | `{"received": true, "duplicate": false, "order_ref": "7KQ4-M2XP", "shipment_status": "out_for_delivery"}` | Stored. `shipment_status` is what the customer now sees. | Nothing. |
| 200 | `{"received": true, "duplicate": true, ...}` | This `event_id` was already stored. | Nothing. |
| 400 | `{"error": "invalid_request", "details": [{"field": "status", "message": "..."}]}` | The body is wrong. Every bad field is listed. | Fix and resend. |
| 401 | `{"error": "unauthorized"}` | Missing or wrong key. | Check the key. |
| 403 | `{"error": "forbidden"}` | The shipment belongs to another partner. | Do not retry. |
| 404 | `{"error": "shipment_not_found"}` | We have no order or shipment with that reference. | Check the reference. |
| 409 | `{"error": "order_not_ready"}` | The order exists but has not been paid. | Do not ship; do not retry. |
| 409 | `{"error": "order_not_shippable"}` | The order was refunded or cancelled. Statuses that move the parcel forward (`preparing` to `delivered`, `delivery_attempted`, `back_at_depot`) are refused; `exception`, `returned` and `cancelled` are still accepted. | Stop the shipment and contact the shop. |
| 500, 503 | `{"error": "..."}` | A problem on our side. | Retry later with the same `event_id`. |

For 500 and 503, please retry with increasing waits (for example 1 minute, 5 minutes, 30 minutes, then hourly for a day).

---

## 3. What we send you when an order is paid

You provide one endpoint. We call it once per paid order.

```
POST {YOUR_API}/shipments
Authorization: Bearer <key you gave us>
Content-Type: application/json
Idempotency-Key: 7KQ4-M2XP
```

`Idempotency-Key` is always our order number. **If you receive the same key twice, return the shipment you already created instead of creating another.** We retry when a call fails or times out (we wait up to 8 seconds), so this rule is what prevents duplicate shipments.

### Body we send

```json
{
  "order_ref": "7KQ4-M2XP",
  "created_at": "2026-10-11T18:02:11Z",
  "paid_at": "2026-10-11T18:03:40Z",
  "test": false,
  "service": "Standardversand",
  "recipient": {
    "name": "Alex Example",
    "email": "alex@example.com",
    "phone": "+491701234567",
    "address": {
      "line1": "Teststraße 1",
      "line2": null,
      "city": "Leipzig",
      "county": "Sachsen",
      "postcode": "04109",
      "country": "DE"
    }
  },
  "items": [
    {
      "sku": "lamellen-wandpaneel-nussbaum",
      "name": "Lamellen-Wandpaneel Nussbaum",
      "quantity": 4,
      "height_mm": 2700,
      "width_mm": 600,
      "depth_mm": 21,
      "weight_kg": null
    }
  ],
  "goods_value": { "amount_pence": 2656, "currency": "EUR" },
  "events_url": "{SHOP}/api/v1/delivery/events"
}
```

| Field | Notes |
|---|---|
| `order_ref` | Our order number. Use it in every update you send back. |
| `test` | `true` for test orders. **Do not ship test orders.** Answer normally so the integration can be checked. |
| `service` | The delivery service the customer paid for, as named in the shop. May be `null`. |
| `recipient.phone`, `line2`, `county` | May be `null`. |
| `recipient.address.country` | ISO 3166-1 alpha-2. |
| `items[].sku` | Our product code. |
| `items[]` sizes | Size of one panel in millimetres. `weight_kg` is `null` when we do not have it. |
| `goods_value` | Value of the goods without delivery, in the smallest currency unit (euro cents), for insurance or customs. |
| `events_url` | Where to send the updates of section 2. |

### What you answer

Any `2xx` status with this body means you accepted the shipment:

```json
{
  "shipment_id": "SHP-99812",
  "status": "preparing",
  "carrier": "Example Couriers",
  "tracking_number": "EC1001DE",
  "tracking_url": "https://tracking.example.com/EC1001DE",
  "estimated_delivery": "2026-10-16"
}
```

| Field | Required | Notes |
|---|---|---|
| `shipment_id` | **yes** | Your id for the shipment. Without it we treat the call as failed. |
| `status` | no | One of the statuses of section 2, if you already know it. |
| `carrier`, `tracking_number`, `tracking_url`, `estimated_delivery` | no | Send them here if known, or later in an update. |

Anything else counts as a failure, and what happens next depends on the status:

| Your answer | What we do |
|---|---|
| `5xx`, `408`, `429`, no `shipment_id`, or no answer within 8 seconds | We try again later with the same `Idempotency-Key`, up to 10 times. |
| Any other `4xx` | We do not try again. Use this when you cannot accept the order at all (an address you do not serve, an unknown item) and answer `422` with `{"error": "<reason>"}`. The reason is recorded for us to act on. |

---

## 4. Checklist before going live

1. `GET /api/v1/delivery/ping` answers `200` with your partner name.
2. A test order (`"test": true`) reaches your `POST /shipments` and you answer with a `shipment_id`.
3. Sending the same `Idempotency-Key` twice returns the same `shipment_id`.
4. You send `preparing`, `dispatched`, `out_for_delivery` and `delivered` for that test order and each answers `200`.
5. Resending one of those updates answers `"duplicate": true`.

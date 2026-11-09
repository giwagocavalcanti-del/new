// End-to-end test of the order flow on this machine, with no outside service:
// checkout page data -> order saved -> Stripe (webhook and confirmation page)
// -> stock -> delivery partner -> UTMify -> emails -> delivery updates ->
// staff panel -> tracking page.
//
//   npm run local:db     (once, starts the local database)
//   npm run test:e2e     (add --keep to leave the test shop running on :3311)
//
// Stripe, the delivery partner, UTMify and the email service are replaced by
// small stand-in servers started by this script, so nothing leaves the computer.
// The emails are saved to .local-db/emails/ to look at them.

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const KEEP = process.argv.includes("--keep");
const APP = "http://127.0.0.1:3311";
const PORTS = { app: 3311, stripe: 4401, partner: 4402, utmify: 4403, resend: 4404 };
const WEBHOOK_SECRET = "whsec_e2e_local";
const CRON_SECRET = "cron-e2e-local";
const PARTNER_OUT_KEY = "out-key-e2e";
const PARTNER_IN_KEY = "in-key-acme-e2e";
const OTHER_IN_KEY = "in-key-other-e2e";
const UTMIFY_TOKEN = "utmify-token-e2e";
const RESEND_KEY = "re_e2e_local";
// Deliberately another name: the shop must still send as "LuxusWand".
const EMAIL_FROM = "Equipe Teste <bestellung@example.com>";
// Test-only staff account of this local test shop.
const ADMIN = { name: "equipe", password: "e2e-local-staff-password-0123456789" };

if (!existsSync(".local-db/env.json")) {
  console.error("Local database not found. Run `npm run local:db` first.");
  process.exit(1);
}
const local = JSON.parse(readFileSync(".local-db/env.json", "utf8"));
mkdirSync(".local-db/emails", { recursive: true });

// ---------------------------------------------------------------------------
// Stand-in servers
// ---------------------------------------------------------------------------

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
};
const sendJson = (response, status, body) =>
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

const stripeMock = { sessions: new Map(), created: [], failNext: false, counter: 0 };
createServer(async (request, response) => {
  const url = new URL(request.url, "http://stripe.local");
  if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    if (stripeMock.failNext) {
      stripeMock.failNext = false;
      return sendJson(response, 500, { error: { type: "api_error", message: "stand-in failure" } });
    }
    const form = new URLSearchParams(await readBody(request));
    let subtotal = 0;
    for (let index = 0; form.has(`line_items[${index}][quantity]`); index++) {
      subtotal +=
        Number(form.get(`line_items[${index}][quantity]`)) *
        Number(form.get(`line_items[${index}][price_data][unit_amount]`));
    }
    const shipping = Number(form.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]") ?? 0);
    const id = `cs_test_e2e_${++stripeMock.counter}`;
    const session = {
      id,
      object: "checkout.session",
      status: "open",
      url: `https://checkout.stripe.test/pay/${id}`,
      client_reference_id: form.get("client_reference_id"),
      customer_email: form.get("customer_email"),
      metadata: { order_ref: form.get("metadata[order_ref]") },
      amount_subtotal: subtotal,
      amount_total: subtotal + shipping,
      payment_status: "unpaid",
      success_url: form.get("success_url"),
      cancel_url: form.get("cancel_url"),
      expires_at: Number(form.get("expires_at")),
      shipping_option_count: [...form.keys()].filter((key) => /^shipping_options\[\d+\]\[shipping_rate_data\]\[display_name\]$/.test(key)).length,
      shipping_name: form.get("payment_intent_data[shipping][name]"),
      collects_address: form.has("shipping_address_collection[allowed_countries][0]"),
    };
    stripeMock.sessions.set(id, session);
    stripeMock.created.push(session);
    return sendJson(response, 200, session);
  }
  const expire = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/);
  if (request.method === "POST" && expire) {
    const session = stripeMock.sessions.get(expire[1]);
    if (!session) return sendJson(response, 404, { error: { message: "no such session" } });
    session.status = "expired";
    session.url = null;
    return sendJson(response, 200, session);
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/checkout/sessions/")) {
    const session = stripeMock.sessions.get(url.pathname.split("/").pop());
    return session ? sendJson(response, 200, session) : sendJson(response, 404, { error: { message: "no such session" } });
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/payment_intents/")) {
    const id = url.pathname.split("/").pop();
    return sendJson(response, 200, {
      id,
      object: "payment_intent",
      latest_charge: {
        id: "ch_e2e",
        object: "charge",
        balance_transaction: { id: "txn_e2e", object: "balance_transaction", fee: 137 },
        payment_method_details: { type: "card", card: { brand: "visa", last4: "4242", wallet: null } },
      },
    });
  }
  sendJson(response, 404, { error: { message: `stand-in has no ${request.method} ${url.pathname}` } });
}).listen(PORTS.stripe, "127.0.0.1");

const partnerMock = { requests: [], failNext: false, refuseNext: false };
createServer(async (request, response) => {
  const body = JSON.parse((await readBody(request)) || "null");
  partnerMock.requests.push({ path: request.url, headers: request.headers, body });
  if (partnerMock.failNext) {
    partnerMock.failNext = false;
    return sendJson(response, 500, { error: "warehouse system offline" });
  }
  if (partnerMock.refuseNext) {
    partnerMock.refuseNext = false;
    return sendJson(response, 422, { error: "postcode not served" });
  }
  sendJson(response, 201, {
    shipment_id: `SHP-${partnerMock.requests.length}`,
    carrier: "Example Couriers",
    tracking_number: `EC${1000 + partnerMock.requests.length}DE`,
    tracking_url: "https://tracking.example.com/EC1001DE",
    estimated_delivery: "2026-10-16",
  });
}).listen(PORTS.partner, "127.0.0.1");

const utmifyMock = { requests: [] };
createServer(async (request, response) => {
  utmifyMock.requests.push({ headers: request.headers, body: JSON.parse((await readBody(request)) || "null") });
  sendJson(response, 200, { ok: true });
}).listen(PORTS.utmify, "127.0.0.1");

const resendMock = { emails: [], failNext: 0, rejectNext: false };
createServer(async (request, response) => {
  const body = JSON.parse((await readBody(request)) || "null");
  if (resendMock.failNext > 0) {
    resendMock.failNext--;
    return sendJson(response, 500, { message: "stand-in failure" });
  }
  if (resendMock.rejectNext) {
    resendMock.rejectNext = false;
    return sendJson(response, 422, { message: "Invalid `to` field" });
  }
  resendMock.emails.push({ headers: request.headers, body });
  const kind = body?.tags?.[0]?.value ?? "email";
  writeFileSync(`.local-db/emails/${resendMock.emails.length}-${kind}.html`, body.html);
  sendJson(response, 200, { id: `email-${resendMock.emails.length}` });
}).listen(PORTS.resend, "127.0.0.1");

// ---------------------------------------------------------------------------
// The shop under test
// ---------------------------------------------------------------------------

const app = spawn("npx", ["next", "dev", "--port", String(PORTS.app)], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-e2e",
    STRIPE_SECRET_KEY: "sk_test_e2e_local",
    STRIPE_API_BASE: `http://127.0.0.1:${PORTS.stripe}`,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPABASE_URL: local.url,
    SUPABASE_SECRET_KEY: local.secretKey,
    DELIVERY_PARTNER_NAME: "acme",
    DELIVERY_PARTNER_API_URL: `http://127.0.0.1:${PORTS.partner}`,
    DELIVERY_PARTNER_API_KEY: PARTNER_OUT_KEY,
    DELIVERY_API_KEYS: `acme:${PARTNER_IN_KEY}, other:${OTHER_IN_KEY}`,
    UTMIFY_API_TOKEN: UTMIFY_TOKEN,
    UTMIFY_API_URL: `http://127.0.0.1:${PORTS.utmify}/orders`,
    RESEND_API_KEY: RESEND_KEY,
    RESEND_API_URL: `http://127.0.0.1:${PORTS.resend}/emails`,
    EMAIL_FROM,
    CRON_SECRET,
    ADMIN_ACCOUNTS: `${ADMIN.name}:${ADMIN.password}`,
    NEXT_PUBLIC_SITE_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appLog = "";
app.stdout.on("data", (chunk) => (appLog += chunk));
app.stderr.on("data", (chunk) => (appLog += chunk));

const stop = (code) => {
  app.kill("SIGTERM");
  process.exit(code);
};
process.on("SIGINT", () => stop(130));

async function waitForApp() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(`${APP}/robots.txt`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error("The test shop did not start.\n" + appLog.slice(-2000));
  stop(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        got: ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  }
}
const section = (title) => console.log(`\n${title}`);

async function call(method, path, { body, headers, form } = {}) {
  const response = await fetch(APP + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // an HTML page
  }
  return { status: response.status, json, text, headers: response.headers };
}

const dbHeaders = { apikey: local.secretKey, authorization: `Bearer ${local.secretKey}`, "content-type": "application/json" };
async function rows(table, query) {
  const response = await fetch(`${local.url}/rest/v1/${table}?${query}`, { headers: dbHeaders });
  if (!response.ok) throw new Error(`database read failed: ${await response.text()}`);
  return response.json();
}
async function upsert(table, values) {
  const response = await fetch(`${local.url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...dbHeaders, prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`database write failed: ${await response.text()}`);
}
const orderByRef = async (ref) => (await rows("orders", `ref=eq.${ref}`))[0];
const shipmentOf = async (orderId) => (await rows("shipments", `order_id=eq.${orderId}`))[0];
const emailsOf = async (orderId) => rows("email_messages", `order_id=eq.${orderId}&order=created_at`);
const mailsFor = (ref) => resendMock.emails.filter((mail) => mail.body.subject.includes(ref));
const mailKinds = (ref) => mailsFor(ref).map((mail) => mail.body.tags?.[0]?.value);

function stripeEvent(type, object, { secret = WEBHOOK_SECRET } = {}) {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, livemode: false, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return call("POST", "/api/stripe/webhook", {
    body: payload,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  });
}

const DETAILS = {
  email: "Alex@Example.com",
  name: "Alex Example",
  phone: "+49 170 1234567",
  line1: "Teststraße 1",
  line2: "",
  postcode: "04109",
  city: "Leipzig",
  country: "DE",
};

/** What Stripe reports once the customer paid (or, with `paid: false`, chose a delayed method). */
function completed(session, paymentIntent, { paid = true } = {}) {
  const done = {
    ...session,
    status: "complete",
    url: null,
    payment_status: paid ? "paid" : "unpaid",
    currency: "eur",
    customer_details: { email: session.customer_email, name: DETAILS.name },
    payment_intent: paymentIntent,
  };
  stripeMock.sessions.set(session.id, done);
  return done;
}

let keyCounter = 0;
const newKey = () => `e2ekey${String(++keyCounter).padStart(12, "0")}`;

async function startCheckout(lines, { details = DETAILS, delivery = "standard", key = newKey(), attribution = { consent: false } } = {}) {
  const reply = await call("POST", "/api/checkout", { body: { lines, details, deliveryOptionId: delivery, checkoutKey: key, attribution } });
  const session = reply.json?.url ? stripeMock.sessions.get(reply.json.url.split("/").pop()) : null;
  return { reply, session, ref: session?.metadata.order_ref, key };
}

const partnerEvent = (body, key = PARTNER_IN_KEY) =>
  call("POST", "/api/v1/delivery/events", { body, headers: key ? { authorization: `Bearer ${key}` } : {} });
const retry = () => call("GET", "/api/internal/retry", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
const money = (pence) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(pence / 100);

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

await waitForApp();

section("Checkout page and server checks");

check("checkout page answers", (await call("GET", "/checkout")).status === 200);
const before = (await rows("orders", "select=id")).length;
const bad = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-nussbaum", qty: 2, pricePence: 1 }, { slug: "nope", qty: 1 }], details: DETAILS, deliveryOptionId: "standard" } });
check("a tampered basket is refused", bad.status === 400 && bad.json?.error === "invalid_basket", bad.json);
const badDetails = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }], details: { ...DETAILS, email: "kein-email", postcode: "123", name: "<b>x</b>" }, deliveryOptionId: "standard" } });
check("wrong contact or address details are refused field by field", badDetails.status === 400 && ["email", "postcode", "name"].every((field) => badDetails.json?.fields?.[field]), badDetails.json);
const badDelivery = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }], details: DETAILS, deliveryOptionId: "teleport" } });
check("an unknown delivery option is refused", badDelivery.status === 400 && badDelivery.json?.error === "invalid_delivery", badDelivery.json);
const abroad = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }], details: { ...DETAILS, country: "FR" }, deliveryOptionId: "standard" } });
check("an address outside Germany is refused", abroad.status === 400 && Boolean(abroad.json?.fields?.country), abroad.json);

await upsert("stock_levels", [
  { slug: "lamellen-wandpaneel-raeuchereiche", available: 1 },
  { slug: "lamellen-wandpaneel-eiche-gekalkt", available: 5 },
]);
const short = await startCheckout([{ slug: "lamellen-wandpaneel-raeuchereiche", qty: 2 }]);
check("not enough stock is refused, with what is left", short.reply.status === 409 && short.reply.json?.error === "out_of_stock" && short.reply.json?.items?.[0]?.available === 1, short.reply.json);
check("and none of the refused checkouts created an order", (await rows("orders", "select=id")).length === before);

const a = await startCheckout(
  [
    { slug: "lamellen-wandpaneel-nussbaum", qty: 16 },
    { slug: "lamellen-wandpaneel-eiche-gekalkt", qty: 1 },
  ],
  { attribution: { consent: true, params: { utm_source: "tiktok", utm_campaign: "autumn", bogus: "ignored" } } },
);
check("checkout answers with the payment link", a.reply.status === 200 && Boolean(a.session), a.reply.json);
let orderA = await orderByRef(a.ref);
check("order saved as awaiting payment", orderA?.status === "awaiting_payment", orderA?.status);
check("subtotal computed on the server with the quantity discount", orderA?.subtotal_pence === 16 * 789 + 899, orderA?.subtotal_pence);
check("free standard delivery above the threshold, total saved", orderA?.delivery_pence === 0 && orderA?.total_pence === orderA?.subtotal_pence && orderA?.delivery_service === "Standardversand", [orderA?.delivery_pence, orderA?.total_pence]);
check("contact and address saved with the order", orderA?.customer_email === "alex@example.com" && orderA?.customer_name === DETAILS.name && orderA?.shipping_address?.postcode === "04109" && orderA?.shipping_address?.line1 === "Teststraße 1" && orderA?.customer_phone === DETAILS.phone, orderA?.shipping_address);
check("Stripe was asked for exactly the same total", a.session?.amount_total === orderA?.total_pence, [a.session?.amount_total, orderA?.total_pence]);
check("Stripe gets the email, only the chosen delivery and does not ask for the address again", a.session?.customer_email === "alex@example.com" && a.session?.shipping_option_count === 1 && !a.session?.collects_address && a.session?.shipping_name === DETAILS.name, a.session);
check("the payment page closes after an hour", a.session && Math.abs(a.session.expires_at - Date.now() / 1000 - 3600) < 120, a.session?.expires_at);
check("order linked to the Stripe session", orderA?.stripe_session_id === a.session?.id);
check("only known advert details are kept", JSON.stringify(orderA?.tracking_params) === JSON.stringify({ utm_source: "tiktok", utm_campaign: "autumn" }), orderA?.tracking_params);
check("two order lines saved", (await rows("order_items", `order_id=eq.${orderA.id}`)).length === 2);
check("marked as a test order", orderA?.is_test === true);

const ordersBeforeRepeat = (await rows("orders", "select=id")).length;
const again = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-eiche-gekalkt", qty: 1 }, { slug: "lamellen-wandpaneel-nussbaum", qty: 16 }], details: DETAILS, deliveryOptionId: "standard", checkoutKey: a.key, attribution: { consent: true } } });
check("pressing pay again (or reloading) reuses the same order and payment page", again.status === 200 && again.json?.url === a.session.url && again.json?.reused === true && (await rows("orders", "select=id")).length === ordersBeforeRepeat, again.json);

const x = await startCheckout([{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }]);
const xChanged = await call("POST", "/api/checkout", { body: { lines: [{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }], details: { ...DETAILS, line1: "Andere Straße 5" }, deliveryOptionId: "express", checkoutKey: x.key } });
const x2 = stripeMock.sessions.get(xChanged.json?.url?.split("/").pop());
check("changing the address on the same page closes the old payment page", stripeMock.sessions.get(x.session.id).status === "expired" && (await orderByRef(x.ref)).status === "cancelled", stripeMock.sessions.get(x.session.id).status);
check("and opens a new order with the new address and delivery", x2 && x2.id !== x.session.id && (await orderByRef(x2.metadata.order_ref)).shipping_address.line1 === "Andere Straße 5" && x2.amount_total === 899 + 1995, x2?.amount_total);

stripeMock.failNext = true;
const broken = await startCheckout([{ slug: "lamellen-wandpaneel-nussbaum", qty: 1 }]);
const orphan = (await rows("orders", "order=created_at.desc&limit=1"))[0];
check("when Stripe fails the customer is told", broken.reply.status === 502 && broken.reply.json?.error === "checkout_failed", broken.reply.json);
check("and the saved order is closed", orphan?.status === "cancelled", orphan?.status);

section("Payment confirmed by the Stripe webhook");

const forged = await stripeEvent("checkout.session.completed", completed(a.session, "pi_e2e_a"), { secret: "whsec_wrong" });
check("a forged webhook is rejected", forged.status === 400, forged.status);
check("and leaves the order unpaid", (await orderByRef(a.ref)).status === "awaiting_payment");

const early = await partnerEvent({ event_id: "too-early", order_ref: a.ref, status: "dispatched", occurred_at: "2026-10-14T09:00:00Z" });
check("delivery update before payment is refused", early.status === 409 && early.json?.error === "order_not_ready", early.json);
check("no email goes out before the payment is confirmed", resendMock.emails.length === 0, resendMock.emails.length);

const paid = await stripeEvent("checkout.session.completed", completed(a.session, "pi_e2e_a"));
check("webhook accepted", paid.status === 200, paid.json);
orderA = await orderByRef(a.ref);
check("order is paid", orderA.status === "paid" && Boolean(orderA.paid_at), orderA.status);
check("address and amounts are kept as they were at checkout", orderA.shipping_address.postcode === "04109" && orderA.total_pence === orderA.subtotal_pence, orderA.shipping_address);
check("Stripe fee saved", orderA.gateway_fee_pence === 137, orderA.gateway_fee_pence);
check("stock taken for the product that has a stock count", (await rows("stock_levels", "slug=eq.lamellen-wandpaneel-eiche-gekalkt"))[0].available === 4 && Boolean(orderA.stock_taken_at));

let shipmentA = await shipmentOf(orderA.id);
const sent = partnerMock.requests[0];
check("partner asked to create the shipment", partnerMock.requests.length === 1 && sent?.path === "/shipments", partnerMock.requests.length);
check("with our key and the order number as idempotency key", sent?.headers.authorization === `Bearer ${PARTNER_OUT_KEY}` && sent?.headers["idempotency-key"] === a.ref);
check("with recipient, items and callback address", sent?.body.order_ref === a.ref && sent?.body.recipient.address.postcode === "04109" && sent?.body.items.length === 2 && /^http:\/\/(localhost|127\.0\.0\.1):3311\/api\/v1\/delivery\/events$/.test(sent?.body.events_url), sent?.body);
check("shipment accepted and tracking details stored", shipmentA?.request_status === "accepted" && shipmentA?.partner_shipment_id === "SHP-1" && shipmentA?.tracking_number === "EC1001DE", shipmentA);

const sale = utmifyMock.requests[0];
check("sale reported to UTMify in the documented format", utmifyMock.requests.length === 1 && sale?.headers["x-api-token"] === UTMIFY_TOKEN && sale?.body.orderId === a.ref && sale?.body.status === "paid" && sale?.body.trackingParameters.utm_source === "tiktok", sale?.body);
check("UTMify amounts in cents", JSON.stringify(sale?.body.commission) === JSON.stringify({ totalPriceInCents: orderA.total_pence, gatewayFeeInCents: 137, userCommissionInCents: orderA.total_pence - 137, currency: "EUR" }), sale?.body.commission);

const replay = await stripeEvent("checkout.session.completed", completed(a.session, "pi_e2e_a"));
check("the same webhook twice changes nothing", replay.status === 200 && partnerMock.requests.length === 1 && utmifyMock.requests.length === 1 && mailsFor(a.ref).length === 1, [partnerMock.requests.length, utmifyMock.requests.length, mailsFor(a.ref).length]);
check("and does not take the stock twice", (await rows("stock_levels", "slug=eq.lamellen-wandpaneel-eiche-gekalkt"))[0].available === 4);

section("Confirmation email");

const mail = mailsFor(a.ref)[0];
check("one confirmation, sent to the customer, from the shop, with our key", mail?.body.to?.[0] === "alex@example.com" && mail?.body.from === "LuxusWand <bestellung@example.com>" && mail?.headers.authorization === `Bearer ${RESEND_KEY}`, [mail?.body.to, mail?.body.from]);
check("protected against simultaneous sends", mail?.headers["idempotency-key"] === `confirmation/${a.ref}`, mail?.headers["idempotency-key"]);
check("subject has the order number and marks a test order", mail?.body.subject === `[Test] Bestellung #${a.ref} bestätigt! Wir stellen deine Bestellung zusammen.`, mail?.body.subject);
const trackingUrl = new RegExp(`http://(localhost|127\\.0\\.0\\.1):3311/track/${orderA.tracking_token}`);
check("html and text have the number and the secure tracking link", [mail?.body.html, mail?.body.text].every((part) => part?.includes(a.ref) && trackingUrl.test(part)));
check("lists the items, the total and the address", ["16 × Lamellen-Wandpaneel Nussbaum", money(orderA.total_pence), "Teststraße 1", "04109 Leipzig"].every((text) => mail?.body.text.includes(text)), mail?.body.text);
check("says it is a test order", mail?.body.text.includes("Testbestellung"));
check("payment method saved from Stripe, only the last four digits", orderA.payment_method === "Visa •••• 4242", orderA.payment_method);
const itemsA = await rows("order_items", `order_id=eq.${orderA.id}&order=name`);
check("single-panel price kept next to the price charged", itemsA.every((item) => item.list_unit_pence >= item.unit_pence) && itemsA.some((item) => item.list_unit_pence > item.unit_pence), itemsA.map((item) => [item.unit_pence, item.list_unit_pence]));
const discountA = itemsA.reduce((sum, item) => sum + (item.list_unit_pence - item.unit_pence) * item.quantity, 0);
const nussbaum = itemsA.find((item) => item.slug === "lamellen-wandpaneel-nussbaum");
const mustSay = [
  "Hallo Alex!",
  "Deine Zahlung war erfolgreich und deine Bestellung ist bestätigt. Wir stellen deine Produkte schon sorgfältig zusammen und bereiten den Versand vor.",
  `Bestellnummer: #${a.ref}`,
  "Bestelldatum: ",
  "Farbe: Nussbaum",
  "Format: Premium · 270 × 60 cm",
  `Stückpreis: ${money(nussbaum.unit_pence)} (Mengenpreis, Einzelpreis ${money(nussbaum.list_unit_pence)})`,
  `Zwischensumme: ${money(nussbaum.total_pence)}`,
  `Mengenrabatt: −${money(discountA)}`,
  `Zwischensumme: ${money(orderA.subtotal_pence)}`,
  "Versand (Standardversand): Kostenlos",
  `Gesamt bezahlt: ${money(orderA.total_pence)}`,
  "Zahlungsart: Visa •••• 4242",
  "Status: Zahlung bestätigt",
  "Deutschland",
  "Versandart: Standardversand",
  "Voraussichtliche Lieferzeit: 4–7 Werktage nach Zahlungseingang",
  "Meine Bestellung verfolgen",
  "Alle Kontaktwege: ",
  "Sobald deine Bestellung verschickt ist, sagen wir dir Bescheid. Danke, dass du bei LuxusWand eingekauft hast!",
];
const missing = mustSay.filter((text) => !mail?.body.text.includes(text));
check("text has name, number, date, items with colour, format, unit price and line total, discount, delivery, total, payment, address, delivery time, tracking and contact", missing.length === 0, missing);
check("html has the same details and the product pictures", ["Hallo Alex!", "Farbe: Nussbaum", "Menge: 16", "Mengenrabatt", "Visa •••• 4242", "✓ Zahlung bestätigt", "Meine Bestellung verfolgen", "/products/email/lamellen-wandpaneel-nussbaum.jpg", "/products/email/lamellen-wandpaneel-eiche-gekalkt.jpg"].every((text) => mail?.body.html.includes(text)));
const picture = await fetch(`${APP}/products/email/lamellen-wandpaneel-nussbaum.jpg`);
check("the product picture in the email loads", picture.status === 200 && picture.headers.get("content-type") === "image/jpeg", picture.status);
check("recorded as sent, once", JSON.stringify((await emailsOf(orderA.id)).map((row) => [row.kind, row.status, row.attempts])) === JSON.stringify([["confirmation", "sent", 1]]));
check("confirmation page shows the number and mentions the email", (await call("GET", `/checkout/success?session_id=${a.session.id}`)).text.includes(a.ref) && (await call("GET", `/checkout/success?session_id=${a.session.id}`)).text.includes("Bestätigung an"));

section("Payment confirmed by the confirmation page (webhook late)");

const p = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-natur", qty: 1 }], { delivery: "express" });
completed(p.session, "pi_e2e_p");
const partnerBeforeP = partnerMock.requests.length;
const pPage = await call("GET", `/checkout/success?session_id=${p.session.id}`);
let orderP = await orderByRef(p.ref);
check("the page asks Stripe and confirms the order itself", pPage.text.includes("Deine Bestellung ist bestätigt") && pPage.text.includes(p.ref) && orderP.status === "paid", orderP.status);
check("express delivery charged as chosen", orderP.delivery_pence === 1995 && orderP.total_pence === 899 + 1995 && orderP.delivery_service === "Expressversand");
await call("GET", `/checkout/success?session_id=${p.session.id}`);
await stripeEvent("checkout.session.completed", stripeMock.sessions.get(p.session.id));
check("reloading the page and the late webhook keep one order, one shipment, one email", partnerMock.requests.length === partnerBeforeP + 1 && mailKinds(p.ref).join() === "confirmation", [partnerMock.requests.length - partnerBeforeP, mailKinds(p.ref)]);
check("the page links to the tracking page", pPage.text.includes(`/track/${orderP.tracking_token}`));

section("Things arriving at the same moment");

const twinKey = newKey();
const twinLines = [{ slug: "lamellen-wandpaneel-eiche-natur", qty: 3 }];
const ordersBeforeTwins = (await rows("orders", "select=id")).length;
const twins = await Promise.all([1, 2, 3].map(() => call("POST", "/api/checkout", { body: { lines: twinLines, details: DETAILS, deliveryOptionId: "standard", checkoutKey: twinKey } })));
const twinUrls = new Set(twins.map((reply) => reply.json?.url).filter(Boolean));
check("three clicks on pay at the same moment make one order", (await rows("orders", "select=id")).length === ordersBeforeTwins + 1 && twinUrls.size === 1 && twins.every((reply) => reply.status === 200 || reply.json?.error === "checkout_busy"), twins.map((reply) => [reply.status, reply.json?.error]));
const twinSession = stripeMock.sessions.get([...twinUrls][0]?.split("/").pop());
const partnerBeforeTwins = partnerMock.requests.length;
const twinPaid = completed(twinSession, "pi_e2e_twin");
await Promise.all([
  stripeEvent("checkout.session.completed", twinPaid),
  stripeEvent("checkout.session.completed", twinPaid),
  call("GET", `/checkout/success?session_id=${twinSession.id}`),
]);
const twinRef = twinSession.metadata.order_ref;
check("two webhooks and the confirmation page at once: one shipment request, one email", partnerMock.requests.length === partnerBeforeTwins + 1 && mailKinds(twinRef).join() === "confirmation" && (await orderByRef(twinRef)).status === "paid", [partnerMock.requests.length - partnerBeforeTwins, mailKinds(twinRef)]);

section("Pending, declined and cancelled payments");

const q = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-honig", qty: 1 }]);
await stripeEvent("checkout.session.completed", completed(q.session, "pi_e2e_q", { paid: false }));
let orderQ = await orderByRef(q.ref);
check("a delayed payment method leaves the order processing", orderQ.status === "processing" && Boolean(orderQ.processing_at), orderQ.status);
const qPage = await call("GET", `/checkout/success?session_id=${q.session.id}`);
check("result page explains the pending payment and shows the number", qPage.text.includes("Zahlung wird bearbeitet") && qPage.text.includes(q.ref) && qPage.text.includes(`/track/${orderQ.tracking_token}`));
check("tracking page shows payment and delivery apart", (await call("GET", `/track/${orderQ.tracking_token}`)).text.includes("Wird bearbeitet"));
check("nothing is shipped or emailed while the payment is pending", mailsFor(q.ref).length === 0 && !(await shipmentOf(orderQ.id)), mailsFor(q.ref).length);
await stripeEvent("checkout.session.async_payment_succeeded", completed(q.session, "pi_e2e_q"));
orderQ = await orderByRef(q.ref);
check("when the bank confirms, the order is paid and the confirmation goes out", orderQ.status === "paid" && mailKinds(q.ref).join() === "confirmation" && Boolean(await shipmentOf(orderQ.id)), [orderQ.status, mailKinds(q.ref)]);

const r = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-schwarz", qty: 1 }]);
await stripeEvent("checkout.session.completed", completed(r.session, "pi_e2e_r", { paid: false }));
await stripeEvent("checkout.session.async_payment_failed", stripeMock.sessions.get(r.session.id));
const orderR = await orderByRef(r.ref);
check("a failed delayed payment marks the order as failed", orderR.status === "payment_failed" && Boolean(orderR.payment_failed_at), orderR.status);
check("result page says it was not charged", (await call("GET", `/checkout/success?session_id=${r.session.id}`)).text.includes("nicht ausgeführt"));
check("tracking page says so too, and nothing ships or is emailed", (await call("GET", `/track/${orderR.tracking_token}`)).text.includes("Nicht ausgeführt") && mailsFor(r.ref).length === 0 && !(await shipmentOf(orderR.id)));

const s = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-gekalkt", qty: 1 }]);
await stripeEvent("payment_intent.payment_failed", { id: "pi_e2e_s", object: "payment_intent", metadata: { order_ref: s.ref }, last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } });
const orderS = await orderByRef(s.ref);
check("a declined card is recorded and the order stays open for another card", orderS.status === "awaiting_payment" && orderS.last_payment_error?.includes("insufficient_funds"), orderS.last_payment_error);
const sPage = await call("GET", `/checkout/success?session_id=${s.session.id}`);
check("result page offers to go back to the payment page", sPage.text.includes("Zurück zur Bezahlung") && sPage.text.includes("abgelehnt"));
const cancelPage = await call("GET", `/checkout/cancelled?session_id=${s.session.id}`);
check("leaving the payment page also offers the way back", cancelPage.text.includes(s.session.url));
await stripeEvent("checkout.session.expired", { ...stripeMock.sessions.get(s.session.id), status: "expired" });
check("an expired payment page cancels the order", (await orderByRef(s.ref)).status === "cancelled");
const late = await stripeEvent("checkout.session.completed", completed(s.session, "pi_e2e_s"));
const logS = await rows("integration_log", `order_id=eq.${orderS.id}&action=eq.paid_after_close`);
check("a payment arriving after that does not revive or ship it, and is flagged for a refund", late.status === 200 && (await orderByRef(s.ref)).status === "cancelled" && !(await shipmentOf(orderS.id)) && mailsFor(s.ref).length === 0 && logS.length === 1);

section("Email failures and retries");

resendMock.failNext = 1;
partnerMock.failNext = true;
const c = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-schwarz", qty: 2 }], { attribution: { consent: true, params: null } });
const paidC = await stripeEvent("checkout.session.completed", completed(c.session, "pi_e2e_c"));
const orderC = await orderByRef(c.ref);
let shipmentC = await shipmentOf(orderC.id);
let emailC = (await emailsOf(orderC.id))[0];
check("an email failure keeps the order paid and its shipment", paidC.status === 200 && orderC.status === "paid" && Boolean(shipmentC), paidC.status);
check("the failed email is recorded with the reason", emailC?.status === "failed" && emailC?.attempts === 1 && emailC?.last_error.includes("500") && mailsFor(c.ref).length === 0, emailC);
check("partner failure is recorded too", shipmentC.request_status === "failed" && shipmentC.request_error.includes("500"), shipmentC);
check("retry needs the secret", (await call("GET", "/api/internal/retry")).status === 401);
const retried = await retry();
shipmentC = await shipmentOf(orderC.id);
emailC = (await emailsOf(orderC.id))[0];
check("retry sends the email that failed", retried.status === 200 && mailsFor(c.ref).length === 1 && emailC.status === "sent" && emailC.attempts === 2, [retried.json, emailC]);
check("retry gets the shipment accepted", shipmentC.request_status === "accepted", shipmentC.request_status);
await retry();
check("another retry sends nothing more", mailsFor(c.ref).length === 1);

resendMock.rejectNext = true;
partnerMock.refuseNext = true;
const e = await startCheckout([{ slug: "lamellen-wandpaneel-eiche-honig", qty: 1 }], { details: { ...DETAILS, name: "Zoë O'Neil-Brandt" } });
await stripeEvent("checkout.session.completed", completed(e.session, "pi_e2e_e"));
const orderE = await orderByRef(e.ref);
check("an email refused for good is marked rejected and not retried", (await emailsOf(orderE.id))[0]?.status === "rejected" && (await retry()) && mailsFor(e.ref).length === 0);
const shipmentE = await shipmentOf(orderE.id);
check("an order the partner refuses is kept with the reason", shipmentE.request_status === "failed" && shipmentE.request_error.includes("postcode not served"), shipmentE);

section("Delivery partner updates and their emails");

check("no key is refused", (await partnerEvent({}, null)).status === 401);
check("wrong key is refused", (await partnerEvent({}, "not-a-key")).status === 401);
const invalid = await partnerEvent({ event_id: "x", order_ref: a.ref, status: "flying", occurred_at: "yesterday", tracking_url: "http://insecure.example" });
check("invalid update explains each field", invalid.status === 400 && ["status", "occurred_at", "tracking_url"].every((field) => invalid.json?.details?.some((d) => d.field === field)), invalid.json);

const e1 = await partnerEvent({ event_id: "evt-1", order_ref: a.ref, status: "dispatched", occurred_at: "2026-10-14T09:00:00Z", description: "Im Lager abgeholt", location: "Hamburg" });
check("dispatch recorded", e1.status === 200 && e1.json?.shipment_status === "dispatched", e1.json);
const dispatchMail = mailsFor(a.ref).find((m) => m.body.tags?.[0]?.value === "dispatched");
check("dispatch email with carrier, tracking number and link", dispatchMail?.body.subject === `[Test] Deine Bestellung ${a.ref} ist unterwegs` && ["Example Couriers", "EC1001DE", "https://tracking.example.com/EC1001DE", a.ref].every((text) => dispatchMail?.body.text.includes(text)) && trackingUrl.test(dispatchMail?.body.text), dispatchMail?.body.text);
await partnerEvent({ event_id: "evt-1", order_ref: a.ref, status: "dispatched", occurred_at: "2026-10-14T09:00:00Z" });
await partnerEvent({ event_id: "evt-1b", order_ref: a.ref, status: "in_transit", occurred_at: "2026-10-14T18:00:00Z", location: "Kassel" });
check("a repeated update and a transit update send no second dispatch email", mailKinds(a.ref).join() === "confirmation,dispatched", mailKinds(a.ref));
const e2 = await partnerEvent({ event_id: "evt-2", order_ref: a.ref.toLowerCase().replace("-", ""), status: "out_for_delivery", occurred_at: "2026-10-16T07:30:00+01:00", description: "Beim Fahrer", location: "Depot Leipzig" });
check("out for delivery recorded, any spelling of the number", e2.status === 200 && e2.json?.shipment_status === "out_for_delivery", e2.json);
check("out-for-delivery email sent", mailKinds(a.ref).join() === "confirmation,dispatched,out_for_delivery", mailKinds(a.ref));
const e3 = await partnerEvent({ event_id: "evt-3", order_ref: a.ref, status: "in_transit", occurred_at: "2026-10-15T12:00:00Z" });
check("a late, older update does not move the status back or send an email", e3.json?.shipment_status === "out_for_delivery" && mailsFor(a.ref).length === 3, e3.json);
check("another partner cannot touch this shipment", (await partnerEvent({ event_id: "evt-9", order_ref: a.ref, status: "cancelled", occurred_at: "2026-10-16T10:00:00Z" }, OTHER_IN_KEY)).status === 403);
const e4 = await partnerEvent({ event_id: "evt-4", shipment_id: "SHP-1", status: "delivered", occurred_at: "2026-10-16T11:45:00+01:00", description: "Persönlich übergeben" });
check("delivered, by the partner's own shipment id", e4.json?.order_ref === a.ref && e4.json?.shipment_status === "delivered", e4.json);
check("delivered email sent; four emails in all, each once", mailKinds(a.ref).join() === "confirmation,dispatched,out_for_delivery,delivered" && (await emailsOf(orderA.id)).every((row) => row.status === "sent" && row.attempts === 1), mailKinds(a.ref));
await partnerEvent({ event_id: "evt-4", shipment_id: "SHP-1", status: "delivered", occurred_at: "2026-10-16T11:45:00+01:00" });
check("the delivered update sent twice does not send a second email", mailsFor(a.ref).length === 4);

section("Staff panel: entering the shipment by hand");

check("staff pages without signing in show no orders", !(await call("GET", "/admin")).text.includes(a.ref) && !(await call("GET", `/admin/orders/${e.ref}`)).text.includes("alex@example.com"));
check("staff forms without signing in are refused", (await call("POST", `/api/admin/orders/${e.ref}/shipment`, { form: { status: "dispatched" } })).status === 401);
const wrong = await call("POST", "/api/admin/login", { form: { name: ADMIN.name, password: "wrong" } });
check("a wrong password is refused", wrong.status === 303 && wrong.headers.get("location")?.includes("error=wrong") && !wrong.headers.get("set-cookie"));
const login = await call("POST", "/api/admin/login", { form: { name: ADMIN.name, password: ADMIN.password } });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
check("the right password signs in with a protected cookie", login.status === 303 && /HttpOnly/.test(login.headers.get("set-cookie")) && /SameSite=Strict/.test(login.headers.get("set-cookie")) && Boolean(cookie));
const staff = (path, form, headers = {}) => call("POST", path, { form, headers: { cookie, ...headers } });
check("a forged cookie is refused", (await call("POST", `/api/admin/orders/${e.ref}/shipment`, { form: { status: "dispatched" }, headers: { cookie: `${cookie.slice(0, -4)}AAAA` } })).status === 401);
check("a form sent from another site is refused", (await staff(`/api/admin/orders/${e.ref}/shipment`, { status: "dispatched" }, { origin: "https://evil.example" })).status === 401);
const list = await call("GET", "/admin?filter=to_ship", { headers: { cookie } });
check("signed in, the list shows orders waiting to be shipped", list.text.includes(e.ref) && !list.text.includes(a.ref), [list.text.includes(e.ref), list.text.includes(a.ref)]);

const badUrl = await staff(`/api/admin/orders/${e.ref}/shipment`, { status: "dispatched", carrier: "DHL", tracking_number: "00340434", tracking_url: "http://dhl.example" });
check("a tracking link without https is refused", badUrl.headers.get("location")?.includes("error="));
const ship = await staff(`/api/admin/orders/${e.ref}/shipment`, { status: "dispatched", carrier: "DHL", tracking_number: "00340434161094042557", tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094042557", estimated_delivery: "", note: "Paket an DHL übergeben" });
const shippedE = await shipmentOf(orderE.id);
check("staff saves carrier, code, link and status", ship.headers.get("location")?.includes("saved=1") && shippedE.status === "dispatched" && shippedE.carrier === "DHL" && shippedE.tracking_number === "00340434161094042557", [ship.headers.get("location"), shippedE]);
const staffEvents = await rows("shipment_events", `shipment_id=eq.${shippedE.id}`);
const audit = await rows("shipment_audit", `shipment_id=eq.${shippedE.id}`);
check("the change enters the delivery history and the staff log, with who made it", staffEvents.length === 1 && staffEvents[0].source === "staff" && staffEvents[0].description === "Paket an DHL übergeben" && audit.length === 1 && audit[0].actor === ADMIN.name && audit[0].changes.tracking_number.to === "00340434161094042557", [staffEvents, audit]);
check("dispatch email sent to the customer with the DHL details", mailKinds(e.ref).join() === "dispatched" && mailsFor(e.ref)[0].body.text.includes("00340434161094042557") && mailsFor(e.ref)[0].body.text.includes("DHL"), mailKinds(e.ref));
const same = await staff(`/api/admin/orders/${e.ref}/shipment`, { status: "", carrier: "DHL", tracking_number: "00340434161094042557", tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094042557" });
check("saving again without changes records nothing and sends nothing", same.headers.get("location")?.includes("unchanged=1") && mailsFor(e.ref).length === 1 && (await rows("shipment_audit", `shipment_id=eq.${shippedE.id}`)).length === 1);
await staff(`/api/admin/orders/${e.ref}/shipment`, { status: "delivered", carrier: "DHL", tracking_number: "00340434161094042557", tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094042557" });
check("a delivery entered by staff (not the carrier) sends no delivered email", (await shipmentOf(orderE.id)).status === "delivered" && mailsFor(e.ref).length === 1);
const detailPage = await call("GET", `/admin/orders/${e.ref}`, { headers: { cookie } });
check("the order page shows contact, history and the refused confirmation email", detailPage.text.includes("alex@example.com") && detailPage.text.includes("Paket an DHL übergeben") && detailPage.text.includes("Recusado pelo serviço de email"));
const resent = await staff(`/api/admin/orders/${e.ref}/email`, { kind: "confirmation" });
check("staff can send the refused confirmation again", resent.headers.get("location")?.includes("email=sent") && mailKinds(e.ref).includes("confirmation"), resent.headers.get("location"));
const ePage = await call("GET", `/track/${orderE.tracking_token}`);
check("tracking page shows the staff entry, DHL and the code", ["Zugestellt", "DHL", "00340434161094042557", "Paket an DHL übergeben"].every((text) => ePage.text.includes(text)));
check("and no delivery estimate, since none was given", !ePage.text.includes("Voraussichtliche Zustellung"));
check("signing out ends the session", (await call("POST", "/api/admin/logout", { headers: { cookie } })).headers.get("set-cookie")?.includes("Max-Age=0"));

section("Tracking page and access to other customers' orders");

const wrongEmail = await call("POST", "/api/track", { body: { ref: a.ref, email: "someone@else.com" } });
check("order number with someone else's email finds nothing", wrongEmail.status === 404, wrongEmail.json);
const lookup = await call("POST", "/api/track", { body: { ref: a.ref.toLowerCase(), email: "ALEX@example.com" } });
check("order number plus the order's email gives the secure link", lookup.status === 200 && lookup.json?.token === orderA.tracking_token, lookup.json);
const page = await call("GET", `/track/${orderA.tracking_token}`);
check("tracking page shows status, history, carrier and code", page.status === 200 && [a.ref, "Bestätigt", "Zugestellt", "Persönlich übergeben", "EC1001DE", "Example Couriers", "Depot Leipzig", "04109"].every((text) => page.text.includes(text)));
check("and hides email, phone and street", !/alex@example\.com/i.test(page.text) && !page.text.includes("1701234567") && !page.text.includes("Teststraße 1"));
check("one customer's link shows only that order", !page.text.includes(e.ref) && !page.text.includes(c.ref));
check("a guessed link finds nothing", (await call("GET", "/track/not-a-real-token")).text.includes("diese Bestellung nicht finden"));
check("another customer's checkout session shows no order details without it", !(await call("GET", `/checkout/success?session_id=cs_test_e2e_999`)).text.includes(a.ref));

section("Delivery timeline: forecasts, failed attempt, new attempt, receipt");

const t = await startCheckout([{ slug: "lamellen-wandpaneel-raeuchereiche", qty: 1 }]);
await stripeEvent("checkout.session.completed", completed(t.session, "pi_e2e_t"));
const orderT = await orderByRef(t.ref);
const tPage = () => call("GET", `/track/${orderT.tracking_token}`);
let tText = (await tPage()).text;
check("just paid: order confirmed, posting and delivery shown as forecasts", tText.includes("Bestellung bestätigt! Wir haben deine Zahlung erhalten.") && tText.includes("Voraussichtlich") && tText.includes("keine Meldung des Kurierdienstes"));
check("no receipt button before anything could arrive", !tText.includes("Ich habe meine Bestellung erhalten"));
const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();
const badAttempt = await partnerEvent({ event_id: "evt-t0", order_ref: t.ref, status: "delivery_attempted", occurred_at: ago(20), next_attempt_date: "next week" });
check("a next attempt date that is not a date is refused", badAttempt.status === 400 && badAttempt.json?.details?.some((d) => d.field === "next_attempt_date"), badAttempt.json);
await partnerEvent({ event_id: "evt-t1", order_ref: t.ref, status: "dispatched", occurred_at: ago(50), carrier: "Example Couriers", tracking_number: "EC9001DE" });
await partnerEvent({ event_id: "evt-t2", order_ref: t.ref, status: "out_for_delivery", occurred_at: ago(30) });
const attemptT = await partnerEvent({ event_id: "evt-t3", order_ref: t.ref, status: "delivery_attempted", occurred_at: ago(20) });
tText = (await tPage()).text;
check("failed attempt: the parcel is going back and a new attempt is planned", attemptT.status === 200 && tText.includes("Die Zustellung konnte nicht abgeschlossen werden. Dein Produkt ist auf dem Rückweg zum Logistikzentrum. Ein neuer Zustellversuch ist in 2 Werktagen geplant.") && tText.includes("Neuer Zustellversuch"));
const nextDay = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
const nextDayText = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${nextDay}T12:00:00Z`));
await partnerEvent({ event_id: "evt-t4", order_ref: t.ref, status: "back_at_depot", occurred_at: ago(10), next_attempt_date: nextDay });
tText = (await tPage()).text;
check("back at the depot, with the carrier's date of the next attempt", tText.includes(`Dein Produkt ist wieder im Logistikzentrum. Der nächste Zustellversuch ist für ${nextDayText} geplant.`) && (await shipmentOf(orderT.id)).next_attempt_on === nextDay, nextDayText);
await partnerEvent({ event_id: "evt-t5", order_ref: t.ref, status: "out_for_delivery", occurred_at: ago(1) });
tText = (await tPage()).text;
const outAgain = await shipmentOf(orderT.id);
check("out again: the page says so and the old date is cleared", tText.includes("Dein Produkt ist wieder in Zustellung.") && outAgain.status === "out_for_delivery" && outAgain.next_attempt_on === null, outAgain);
check("now the customer can confirm receipt", tText.includes("Ich habe meine Bestellung erhalten"));
const confirmT = await call("POST", `/api/track/${orderT.tracking_token}/received`, { form: {} });
const confirmedT = await shipmentOf(orderT.id);
check("confirming goes back to the tracking page and closes the timeline", confirmT.status === 303 && confirmT.headers.get("location")?.endsWith(`/track/${orderT.tracking_token}?received=1`) && Boolean(confirmedT.received_confirmed_at) && confirmedT.status === "delivered", [confirmT.status, confirmT.headers.get("location"), confirmedT]);
tText = (await call("GET", `/track/${orderT.tracking_token}?received=1`)).text;
check("the page thanks the customer and shows no button any more", tText.includes("Danke! Wir haben deine Bestätigung gespeichert.") && tText.includes("Du hast den Empfang bestätigt") && !tText.includes("Ich habe meine Bestellung erhalten"));
await call("POST", `/api/track/${orderT.tracking_token}/received`, { form: {} });
const customerEvents = await rows("shipment_events", `shipment_id=eq.${confirmedT.id}&source=eq.customer`);
check("pressing it again keeps one confirmation", customerEvents.length === 1 && (await shipmentOf(orderT.id)).received_confirmed_at === confirmedT.received_confirmed_at, customerEvents.length);
check("staff can see who confirmed it", (await rows("shipment_audit", `shipment_id=eq.${confirmedT.id}`)).some((row) => row.actor === "Cliente (página de rastreio)"));
check("a confirmation by the customer sends no delivered email", !mailKinds(t.ref).includes("delivered"), mailKinds(t.ref));
check("a confirmation link with a made-up token changes nothing", (await call("POST", "/api/track/not-a-real-token/received", { form: {} })).headers.get("location")?.endsWith("/track/not-a-real-token"));

section("Refunds");

const refund = await stripeEvent("charge.refunded", { id: "ch_e2e", object: "charge", refunded: true, payment_intent: "pi_e2e_c" });
const refundedC = await orderByRef(c.ref);
check("full refund marks the order refunded and tells UTMify", refund.status === 200 && refundedC.status === "refunded" && utmifyMock.requests.at(-1)?.body.status === "refunded", refundedC.status);
const afterRefund = await partnerEvent({ event_id: "evt-c1", order_ref: c.ref, status: "dispatched", occurred_at: "2026-10-17T09:00:00Z" });
check("a refunded order can no longer be dispatched by the partner", afterRefund.status === 409 && afterRefund.json?.error === "order_not_shippable", afterRefund.json);
const login2 = (await call("POST", "/api/admin/login", { form: { name: ADMIN.name, password: ADMIN.password } })).headers.get("set-cookie")?.split(";")[0];
const staffRefunded = await call("POST", `/api/admin/orders/${c.ref}/shipment`, { form: { status: "dispatched", tracking_number: "X1" }, headers: { cookie: login2 } });
check("nor by staff", staffRefunded.headers.get("location")?.includes("error=") && mailsFor(c.ref).length === 1);
const returned = await partnerEvent({ event_id: "evt-c2", order_ref: c.ref, status: "returned", occurred_at: "2026-10-17T10:00:00Z" });
check("but a return is still recorded", returned.status === 200, returned.json);
check("tracking page says refunded", (await call("GET", `/track/${refundedC.tracking_token}`)).text.includes("erstattet"));
check("a refunded order cannot be confirmed as received", (await call("POST", `/api/track/${refundedC.tracking_token}/received`, { form: {} })).headers.get("location")?.endsWith("?received=no") && !(await shipmentOf(orderC.id)).received_confirmed_at);
const partial = await stripeEvent("charge.refunded", { id: "ch_e2e_p", object: "charge", refunded: false, payment_intent: "pi_e2e_p" });
check("partial refund leaves the order paid", partial.status === 200 && (await orderByRef(p.ref)).status === "paid");

const ghost = await stripeEvent("checkout.session.completed", completed({ id: "cs_test_ghost", client_reference_id: "00000000-0000-4000-8000-000000000000", amount_subtotal: 100, amount_total: 100 }, "pi_ghost"));
check("payment without a matching order raises an error for Stripe", ghost.status === 500, ghost.status);

const log = await rows("integration_log", "select=target,action,ok");
check("every outside call is logged, failures included", log.some((entry) => entry.target === "email" && !entry.ok) && log.some((entry) => entry.target === "delivery_partner" && !entry.ok) && log.filter((entry) => entry.target === "utmify").length >= 3, log.length);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log("Failed:\n  - " + failures.join("\n  - "));
console.log(`Emails written to .local-db/emails/ (${resendMock.emails.length})`);

if (KEEP) {
  console.log(`\nTest shop left running on ${APP} (Ctrl+C to stop).`);
  console.log(`Tracking page of a test order: ${APP}/track/${orderA.tracking_token}`);
  console.log(`Staff panel: ${APP}/admin (user ${ADMIN.name}, password in scripts/e2e-local.mjs)`);
} else {
  stop(failures.length ? 1 : 0);
}

import { site } from "@/config/site";
import { getProduct } from "@/data/catalogue";
import { emailThumbnails } from "@/data/photo-variants";
import { formatMoney } from "@/lib/pricing";
import {
  logCall,
  requireDb,
  type EmailKind,
  type EmailMessageRow,
  type EmailStatus,
  type OrderItemRow,
  type OrderRow,
  type ShipmentRow,
} from "@/server/db";
import { postJson } from "@/server/http";
import { getOrderById, getOrderItems, getShipment, updateOrder } from "@/server/orders";

// The emails an order can receive, sent through Resend
// (https://resend.com/docs/api-reference/emails/send-email):
//   confirmation      once the payment is confirmed
//   dispatched        once the parcel left with a tracking number
//   out_for_delivery  when the carrier reports the parcel is with the driver
//   delivered         when the carrier reports the delivery
//
// Each (order, kind) pair has one row in `email_messages`, which is what keeps
// an email from going out twice, records every attempt and lets the retry
// route send again what failed. A failed email never changes the order.

const DEFAULT_URL = "https://api.resend.com/emails";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A send that started this long ago and never finished is treated as failed. */
const STALE_SENDING_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
/** After this long an email about an order would only confuse the customer. */
const GIVE_UP_AFTER_MS = 7 * DAY_MS;

/** Later emails make earlier ones pointless: a delivered parcel needs no "on its way" email. */
const SHIPMENT_RANK: Partial<Record<EmailKind, number>> = { dispatched: 1, out_for_delivery: 2, delivered: 3 };

/** The address part of EMAIL_FROM, which may be "bestellung@…" or "Any Name <bestellung@…>". */
function senderAddress(value: string | undefined) {
  const address = (value?.match(/<([^<>]+)>\s*$/)?.[1] ?? value ?? "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(address) ? address : null;
}

function sender() {
  const key = process.env.RESEND_API_KEY;
  const address = senderAddress(process.env.EMAIL_FROM);
  if (!key || !address) return null;
  // The customer always sees the shop's name as the sender, whatever name EMAIL_FROM carries.
  return { key, from: `${site.name.replace(/["\\]/g, "")} <${address}>` };
}

/** False while the email service is not set up: the shop then says nothing about emails. */
export const emailEnabled = () => sender() !== null;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type Email = { subject: string; html: string; text: string };

/** Building blocks, each with its html and plain-text form. */
type Block = { html: string; text: string };

const COLORS = { paper: "#f4efe6", ink: "#2b2520", muted: "#75695c", line: "#e4dccf", brass: "#b08d57" };
const TEST_NOTICE = "Dies ist eine Testbestellung: Es wurde nichts berechnet und es wird nichts versandt.";

const paragraph = (value: string, style = ""): Block => ({
  html: `<p style="margin:0 0 16px;${style}">${escapeHtml(value)}</p>`,
  text: value,
});

const label = (title: string, value: string): Block => ({
  html: `<p style="margin:0 0 4px;color:${COLORS.muted};font-size:13px;">${escapeHtml(title)}</p><p style="margin:0 0 20px;font-size:20px;font-weight:bold;letter-spacing:1px;">${escapeHtml(value)}</p>`,
  text: `${title}: ${value}`,
});

const button = (title: string, url: string, note?: string, secondary = false): Block => ({
  html: `<p style="margin:${secondary ? "0" : "24px"} 0 ${note ? "8px" : "20px"};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:${secondary ? "11px 22px" : "13px 24px"};background:${secondary ? "#ffffff" : COLORS.ink};border:2px solid ${COLORS.ink};border-radius:999px;color:${secondary ? COLORS.ink : "#ffffff"};font-weight:bold;text-decoration:none;">${escapeHtml(title)}</a></p>${note ? `<p style="margin:0 0 20px;color:${COLORS.muted};font-size:13px;">${escapeHtml(note)}</p>` : ""}`,
  text: `${title}: ${url}${note ? `\n${note}` : ""}`,
});

function table(rows: { label: string; amount: string; bold?: boolean }[]): Block {
  const cell = `padding:10px 0;border-bottom:1px solid ${COLORS.line};`;
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.line};font-size:14px;margin:0 0 20px;">${rows
      .map(
        (row) =>
          `<tr><td style="${cell}${row.bold ? "font-weight:bold;" : ""}">${escapeHtml(row.label)}</td><td align="right" style="${cell}white-space:nowrap;${row.bold ? "font-weight:bold;" : ""}">${escapeHtml(row.amount)}</td></tr>`,
      )
      .join("")}</table>`,
    text: rows.map((row) => `${row.label}: ${row.amount}`).join("\n"),
  };
}

function details(rows: [string, string | null][], linkFor?: Record<string, string | null>): Block {
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding:16px;background:${COLORS.paper};border-radius:10px;font-size:14px;">${present
      .map(([title, value]) => {
        const href = linkFor?.[title];
        const shown = href
          ? `<a href="${escapeHtml(href)}" style="color:${COLORS.ink};">${escapeHtml(value)}</a>`
          : escapeHtml(value);
        return `<tr><td style="padding:4px 12px 4px 0;color:${COLORS.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(title)}</td><td style="padding:4px 0;font-weight:bold;word-break:break-all;">${shown}</td></tr>`;
      })
      .join("")}</table>`,
    text: present.map(([title, value]) => `${title}: ${value}`).join("\n"),
  };
}

/** The frame every email shares: shop name, test notice, footer with returns and contact. */
function layout(
  order: OrderRow,
  origin: string,
  subject: string,
  blocks: Block[],
  options: { greeting?: string; preheader?: string } = {},
): Email {
  const returnsUrl = `${origin}/info/returns`;
  const contactUrl = `${origin}/info/contact`;
  const companyLines = [site.company.legalName, site.company.address].filter((line): line is string => Boolean(line));
  const greeting = options.greeting ?? (order.customer_name ? `Hallo ${order.customer_name},` : "Hallo,");
  const all = [paragraph(greeting, "margin-bottom:12px;"), ...(order.is_test ? [paragraph(TEST_NOTICE, `padding:10px 14px;background:${COLORS.paper};border-radius:8px;font-size:14px;`)] : []), ...blocks];
  const fullSubject = `${order.is_test ? "[Test] " : ""}${subject}`;
  // The line email programs show next to the subject in the inbox; hidden in the email itself.
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>\n`
    : "";

  const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(fullSubject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.paper};">
${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${COLORS.ink};"><tr><td style="padding:32px 28px;">
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;">${escapeHtml(site.name)}</p>
<p style="margin:0 0 24px;width:40px;height:2px;background:${COLORS.brass};font-size:0;line-height:0;">&nbsp;</p>
${all.map((block) => block.html).join("\n")}
<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${COLORS.line};color:${COLORS.muted};font-size:13px;"><a href="${escapeHtml(returnsUrl)}" style="color:${COLORS.muted};">Widerruf &amp; Rückgabe</a> · <a href="${escapeHtml(contactUrl)}" style="color:${COLORS.muted};">Schreib uns</a> und nenne deine Bestellnummer.${companyLines.length ? `<br>${companyLines.map(escapeHtml).join("<br>")}` : ""}</p>
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const text = [
    ...all.map((block) => block.text),
    `Widerruf & Rückgabe: ${returnsUrl}`,
    `Fragen? Schreib uns und nenne deine Bestellnummer: ${contactUrl}`,
    ...(companyLines.length ? ["", ...companyLines] : []),
  ].join("\n\n");

  return { subject: fullSubject, html, text };
}

const trackingPage = (order: OrderRow, origin: string) => `${origin}/track/${order.tracking_token}`;
const PRIVATE_LINK = "Dieser Link ist persönlich. Bitte gib ihn nicht weiter.";

// ---------------------------------------------------------------------------
// Order confirmation
// ---------------------------------------------------------------------------

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" });
const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} Uhr`;
const countryName = (code: string | null) => {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["de"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};
const cm = (mm: number) => (mm / 10).toLocaleString(site.locale, { maximumFractionDigits: 1 });
const workingDays = (min: number, max: number) => `${min === max ? min : `${min}–${max}`} Werktage`;

/** Heading above a part of the email. */
const heading = (title: string): Block => ({
  html: `<p style="margin:28px 0 10px;font-family:Georgia,serif;font-size:18px;">${escapeHtml(title)}</p>`,
  text: `— ${title} —`,
});

/** Title–value rows in a light box, without breaking words (dates, names). */
function infoBox(rows: [string, string | null][], extraHtml = ""): Block {
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;background:${COLORS.paper};border-radius:10px;font-size:14px;"><tr><td style="padding:14px 16px;">${present
      .map(
        ([title, value]) =>
          `<p style="margin:0 0 8px;"><span style="color:${COLORS.muted};">${escapeHtml(title)}</span><br><strong>${escapeHtml(value).replace(/\n/g, "<br>")}</strong></p>`,
      )
      .join("")}${extraHtml}</td></tr></table>`,
    text: present.map(([title, value]) => (value.includes("\n") ? `${title}:\n${value}` : `${title}: ${value}`)).join("\n"),
  };
}

/** One bought product: picture, chosen colour and format, quantity, unit price and line total. */
function itemBlock(item: OrderItemRow, origin: string): Block {
  const product = getProduct(item.slug);
  const thumbnail = product?.photos[0] ? emailThumbnails[product.photos[0]] : undefined;
  const size = item.height_mm && item.width_mm ? `${cm(item.height_mm)} × ${cm(item.width_mm)} cm` : null;
  const variants: [string, string | null][] = [
    ["Farbe", product?.finish.name ?? null],
    ["Format", [product?.format.name, size].filter(Boolean).join(" · ") || null],
  ];
  const shownVariants = variants.filter((row): row is [string, string] => Boolean(row[1]));
  // A quantity price: the single-panel price charged at the same time, not a former price.
  const quantityPrice = item.list_unit_pence !== null && item.list_unit_pence > item.unit_pence ? item.list_unit_pence : null;
  const unitNote = quantityPrice ? `Mengenpreis, Einzelpreis ${formatMoney(quantityPrice)}` : null;

  const cell = `padding:14px 0;border-bottom:1px solid ${COLORS.line};vertical-align:top;`;
  const picture = thumbnail
    ? `<img src="${escapeHtml(`${origin}${thumbnail}`)}" width="72" height="72" alt="${escapeHtml(item.name)}" style="display:block;width:72px;height:72px;border:0;border-radius:8px;">`
    : product
      ? `<div style="width:72px;height:72px;border-radius:8px;background:${product.finish.slat};"></div>`
      : "";

  return {
    html: `<tr>${picture ? `<td width="72" style="${cell}width:72px;padding-right:14px;">${picture}</td>` : ""}<td${picture ? "" : ' colspan="2"'} style="${cell}font-size:14px;">
<p style="margin:0 0 4px;font-size:15px;font-weight:bold;">${escapeHtml(item.name)}</p>
${shownVariants.length ? `<p style="margin:0 0 8px;color:${COLORS.muted};font-size:13px;">${shownVariants.map(([title, value]) => `${escapeHtml(title)}: ${escapeHtml(value)}`).join("<br>")}</p>` : ""}
<p style="margin:0;">Menge: ${item.quantity}<br>Stückpreis: ${escapeHtml(formatMoney(item.unit_pence))}${unitNote ? ` <span style="color:${COLORS.muted};font-size:13px;">(${escapeHtml(unitNote)})</span>` : ""}</p>
<p style="margin:6px 0 0;font-weight:bold;">Zwischensumme: ${escapeHtml(formatMoney(item.total_pence))}</p>
</td></tr>`,
    text: [
      `${item.quantity} × ${item.name}`,
      ...shownVariants.map(([title, value]) => `${title}: ${value}`),
      `Stückpreis: ${formatMoney(item.unit_pence)}${unitNote ? ` (${unitNote})` : ""}`,
      `Zwischensumme: ${formatMoney(item.total_pence)}`,
    ].join("\n"),
  };
}

function itemList(items: OrderItemRow[], origin: string): Block {
  const blocks = items.map((item) => itemBlock(item, origin));
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:1px solid ${COLORS.line};">${blocks.map((block) => block.html).join("")}</table>`,
    text: blocks.map((block) => block.text).join("\n\n"),
  };
}

/** "4–7 Werktage nach Zahlungseingang", from the delivery option the customer chose. */
function deliveryEstimate(order: OrderRow): string | null {
  const option = site.delivery.options.find((candidate) => candidate.id === order.delivery_option_id);
  if (!option) return null;
  const { dispatchDays } = site.delivery;
  if (!dispatchDays) return `${workingDays(option.minDays, option.maxDays)} nach dem Versand`;
  return `${workingDays(dispatchDays.min + option.minDays, dispatchDays.max + option.maxDays)} nach Zahlungseingang`;
}

/** How to reach the shop: only the channels the configuration confirms, and always the contact page. */
function customerService(origin: string): Block {
  const contactUrl = `${origin}/info/contact`;
  const { email, phone } = site.company;
  const channels: Block[] = [
    ...(email
      ? [{ html: `E-Mail: <a href="mailto:${escapeHtml(email)}" style="color:${COLORS.ink};">${escapeHtml(email)}</a>`, text: `E-Mail: ${email}` }]
      : []),
    ...(phone
      ? [{ html: `Telefon: <a href="tel:${escapeHtml(phone.replace(/[^+\d]/g, ""))}" style="color:${COLORS.ink};">${escapeHtml(phone)}</a>`, text: `Telefon: ${phone}` }]
      : []),
    { html: `<a href="${escapeHtml(contactUrl)}" style="color:${COLORS.ink};">Alle Kontaktwege</a>`, text: `Alle Kontaktwege: ${contactUrl}` },
  ];
  const intro = "Fragen zu deiner Bestellung? Wir helfen dir gern. Nenne uns dabei bitte deine Bestellnummer.";
  return {
    html: `<p style="margin:0 0 6px;font-size:14px;">${escapeHtml(intro)}</p><p style="margin:0 0 16px;font-size:14px;">${channels.map((channel) => channel.html).join("<br>")}</p>`,
    text: [intro, ...channels.map((channel) => channel.text)].join("\n"),
  };
}

/** First name for the greeting; the whole name when the first word is a title such as "Dr.". */
function firstName(name: string | null) {
  const words = name?.trim().split(/\s+/) ?? [];
  if (!words.length || !words[0]) return null;
  return words[0].endsWith(".") ? words.join(" ") : words[0];
}

/**
 * The order confirmation, sent once the payment is confirmed. Only states what the order
 * and the site configuration confirm: no full card number (the order never has one),
 * no delivery promise beyond the configured working days.
 */
export function confirmationEmail(order: OrderRow, items: OrderItemRow[], origin: string): Email {
  const paid = order.total_pence ?? order.subtotal_pence;
  const name = firstName(order.customer_name);

  const listTotal = items.reduce((sum, item) => sum + (item.list_unit_pence ?? item.unit_pence) * item.quantity, 0);
  const itemsTotal = items.reduce((sum, item) => sum + item.total_pence, 0);
  const discount = listTotal - itemsTotal;

  const address = order.shipping_address;
  const addressLines = address
    ? [
        order.customer_name,
        address.line1,
        address.line2,
        [address.postcode, address.city].filter(Boolean).join(" "),
        countryName(address.country),
      ].filter((line): line is string => Boolean(line))
    : [];

  const paidBadge = `<p style="margin:4px 0 0;"><span style="display:inline-block;padding:4px 12px;background:#e3efe4;border-radius:999px;color:#24603a;font-weight:bold;font-size:13px;">✓ Zahlung bestätigt</span></p>`;

  return layout(
    order,
    origin,
    `Bestellung #${order.ref} bestätigt! Wir stellen deine Bestellung zusammen.`,
    [
      paragraph(
        "Deine Zahlung war erfolgreich und deine Bestellung ist bestätigt. Wir stellen deine Produkte schon sorgfältig zusammen und bereiten den Versand vor. Unten findest du alle Details zu deinem Einkauf.",
      ),
      infoBox([
        ["Bestellnummer", `#${order.ref}`],
        ["Bestelldatum", formatDateTime(order.created_at)],
      ]),

      heading("Deine Bestellung"),
      itemList(items, origin),
      table([
        ...(discount > 0
          ? [
              { label: "Warenwert zum Einzelpreis", amount: formatMoney(listTotal) },
              { label: "Mengenrabatt", amount: `−${formatMoney(discount)}` },
            ]
          : []),
        { label: "Zwischensumme", amount: formatMoney(order.subtotal_pence) },
        ...(order.delivery_pence !== null
          ? [{ label: `Versand${order.delivery_service ? ` (${order.delivery_service})` : ""}`, amount: order.delivery_pence === 0 ? "Kostenlos" : formatMoney(order.delivery_pence) }]
          : []),
        { label: "Gesamt bezahlt", amount: formatMoney(paid), bold: true },
      ]),

      heading("Zahlung"),
      {
        ...infoBox(
          [
            ["Zahlungsart", order.payment_method],
            ["Bezahlt am", order.paid_at ? formatDateTime(order.paid_at) : null],
            ["Betrag", formatMoney(paid)],
          ],
          paidBadge,
        ),
        text: [
          order.payment_method ? `Zahlungsart: ${order.payment_method}` : null,
          order.paid_at ? `Bezahlt am: ${formatDateTime(order.paid_at)}` : null,
          `Betrag: ${formatMoney(paid)}`,
          "Status: Zahlung bestätigt",
        ]
          .filter(Boolean)
          .join("\n"),
      },

      heading("Lieferung"),
      infoBox([
        ["Lieferadresse", addressLines.length ? addressLines.join("\n") : null],
        ["Versandart", order.delivery_service],
        ["Voraussichtliche Lieferzeit", deliveryEstimate(order)],
      ]),
      button("Meine Bestellung verfolgen", trackingPage(order, origin), PRIVATE_LINK),

      heading("Kundenservice"),
      customerService(origin),

      paragraph(`Sobald deine Bestellung verschickt ist, sagen wir dir Bescheid. Danke, dass du bei ${site.name} eingekauft hast!`, "margin-top:8px;font-weight:bold;"),
    ],
    {
      greeting: name ? `Hallo ${name}!` : "Hallo!",
      preheader: "Deine Zahlung war erfolgreich. Hier sind alle Details zu deiner Bestellung.",
    },
  );
}

function courierDetails(shipment: ShipmentRow): Block {
  return details(
    [
      ["Kurierdienst", shipment.carrier],
      ["Sendungsnummer", shipment.tracking_number],
    ],
    { Sendungsnummer: shipment.tracking_url },
  );
}

/** The emails about the parcel. Each one only states what the shipment record says. */
export function shipmentEmail(kind: Exclude<EmailKind, "confirmation">, order: OrderRow, shipment: ShipmentRow, origin: string): Email {
  const carrierLink = shipment.tracking_url ? [button("Beim Kurierdienst verfolgen", shipment.tracking_url)] : [];
  const ourPage = shipment.tracking_url
    ? button("Bestellung ansehen", trackingPage(order, origin), PRIVATE_LINK, true)
    : button("Bestellung verfolgen", trackingPage(order, origin), PRIVATE_LINK);
  const number = label("Bestellnummer", order.ref);

  switch (kind) {
    case "dispatched":
      return layout(order, origin, `Deine Bestellung ${order.ref} ist unterwegs`, [
        paragraph(`gute Nachrichten: Deine Bestellung hat unser Lager verlassen${shipment.carrier ? ` und ist mit ${shipment.carrier} unterwegs` : " und ist unterwegs"}.`),
        number,
        courierDetails(shipment),
        ...carrierLink,
        ourPage,
      ]);
    case "out_for_delivery":
      return layout(order, origin, `Deine Bestellung ${order.ref} ist in Zustellung`, [
        paragraph(`der Kurierdienst meldet, dass dein Paket in Zustellung ist${shipment.carrier ? ` (${shipment.carrier})` : ""}. Bitte sorge, wenn möglich, dafür, dass jemand das Paket annehmen kann.`),
        number,
        courierDetails(shipment),
        ...carrierLink,
        ourPage,
      ]);
    case "delivered":
      return layout(order, origin, `Deine Bestellung ${order.ref} wurde zugestellt`, [
        paragraph("der Kurierdienst meldet, dass dein Paket zugestellt wurde. Wir wünschen dir viel Freude mit deinen Paneelen."),
        paragraph("Falls du das Paket nicht erhalten hast oder etwas beschädigt ist, schreib uns bitte und nenne deine Bestellnummer."),
        number,
        courierDetails(shipment),
        ourPage,
      ]);
  }
}

// ---------------------------------------------------------------------------
// Sending, once per order and kind
// ---------------------------------------------------------------------------

export type SendResult = "sent" | "failed" | "rejected" | "already_sent" | "busy" | "skipped";

async function messageOf(orderId: string, kind: EmailKind) {
  const { data, error } = await requireDb()
    .from("email_messages")
    .select()
    .eq("order_id", orderId)
    .eq("kind", kind)
    .maybeSingle<EmailMessageRow>();
  if (error) throw new Error(`Could not read the email record: ${error.message}`);
  return data;
}

/**
 * Reserves the right to send this email. Only one caller at a time gets it,
 * even with two webhooks arriving at the same moment.
 */
async function claim(order: OrderRow, kind: EmailKind): Promise<EmailMessageRow | "already_sent" | "busy"> {
  const database = requireDb();
  const now = new Date().toISOString();
  const inserted = await database
    .from("email_messages")
    .upsert(
      { order_id: order.id, kind, status: "sending", recipient: order.customer_email, attempts: 1, updated_at: now },
      { onConflict: "order_id,kind", ignoreDuplicates: true },
    )
    .select();
  if (inserted.error) throw new Error(`Could not reserve the email: ${inserted.error.message}`);
  if (inserted.data?.length) return inserted.data[0] as EmailMessageRow;

  const existing = await messageOf(order.id, kind);
  if (!existing) return "busy";
  const stale = existing.status === "sending" && Date.parse(existing.updated_at) < Date.now() - STALE_SENDING_MS;
  if (existing.status !== "failed" && !stale) return existing.status === "sending" ? "busy" : "already_sent";

  // Taken over only if nobody else changed it since it was read.
  const taken = await database
    .from("email_messages")
    .update({ status: "sending", attempts: existing.attempts + 1, recipient: order.customer_email, updated_at: now })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .eq("updated_at", existing.updated_at)
    .select()
    .maybeSingle<EmailMessageRow>();
  if (taken.error) throw new Error(`Could not reserve the email: ${taken.error.message}`);
  return taken.data ?? "busy";
}

async function finish(message: EmailMessageRow, values: { status: EmailStatus; last_error?: string | null; provider_id?: string | null }) {
  const now = new Date().toISOString();
  const { error } = await requireDb()
    .from("email_messages")
    .update({ ...values, updated_at: now, ...(values.status === "sent" ? { sent_at: now } : {}) })
    .eq("id", message.id);
  if (error) console.error("Could not save the email result", error);
}

/** Marks the earlier parcel emails that did not go out as no longer needed. */
async function skipEarlierShipmentEmails(orderId: string, kind: EmailKind) {
  const rank = SHIPMENT_RANK[kind];
  if (!rank) return;
  const earlier = (Object.keys(SHIPMENT_RANK) as EmailKind[]).filter((other) => (SHIPMENT_RANK[other] ?? 0) < rank);
  const { error } = await requireDb()
    .from("email_messages")
    .update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .in("kind", earlier)
    .in("status", ["failed", "rejected"]);
  if (error) console.error("Could not skip earlier emails", error);
}

/** A failure worth trying again later: no answer, a server error or "too many requests". */
const isTemporary = (status: number | null) => status === null || status >= 500 || status === 408 || status === 409 || status === 429;

/**
 * Sends one email of an order, unless it already went out. Never throws for a
 * failed send and never changes the order: the result is recorded instead.
 */
export async function sendOrderEmail(
  kind: EmailKind,
  order: OrderRow,
  origin: string,
  context: { items?: OrderItemRow[]; shipment?: ShipmentRow | null } = {},
): Promise<SendResult> {
  const service = sender();
  if (!service || order.status !== "paid" || !order.customer_email) return "skipped";

  const shipment = kind === "confirmation" ? null : (context.shipment ?? (await getShipment(order.id)));
  if (kind !== "confirmation" && !shipment) return "skipped";

  const message = await claim(order, kind);
  if (typeof message === "string") return message;

  let email: Email;
  try {
    email =
      kind === "confirmation"
        ? confirmationEmail(order, context.items ?? (await getOrderItems(order.id)), origin)
        : shipmentEmail(kind, order, shipment!, origin);
  } catch (error) {
    await finish(message, { status: "failed", last_error: `Could not build the email: ${String(error)}` });
    return "failed";
  }

  const reply = await postJson(process.env.RESEND_API_URL ?? DEFAULT_URL, {
    // Resend keeps this key for 24 hours: a send repeated in that time is not delivered twice.
    headers: { authorization: `Bearer ${service.key}`, "idempotency-key": `${kind}/${order.ref}` },
    body: {
      from: service.from,
      to: [order.customer_email],
      ...(site.company.email ? { reply_to: site.company.email } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: "kind", value: kind }],
    },
    timeoutMs: 6000,
  });

  const detail = reply.ok ? null : `HTTP ${reply.status ?? "no answer"}: ${reply.text.slice(0, 500)}`;
  await logCall({ orderId: order.id, target: "email", action: `order.${kind}`, ok: reply.ok, httpStatus: reply.status, detail });

  if (!reply.ok) {
    const temporary = isTemporary(reply.status) && message.attempts < MAX_ATTEMPTS;
    await finish(message, { status: temporary ? "failed" : "rejected", last_error: detail });
    return temporary ? "failed" : "rejected";
  }

  const providerId = reply.json && typeof reply.json === "object" ? String((reply.json as { id?: unknown }).id ?? "") || null : null;
  await finish(message, { status: "sent", last_error: null, provider_id: providerId });
  if (kind === "confirmation") await updateOrder(order.id, { confirmation_email_sent_at: new Date().toISOString() }).catch(() => {});
  await skipEarlierShipmentEmails(order.id, kind);
  return "sent";
}

/**
 * The parcel email that fits the shipment as it is now, if one is due.
 * `carrierEvent` is true only for updates sent by the delivery partner: "in
 * delivery" and "delivered" emails are only sent on the carrier's word.
 */
export async function notifyShipment(order: OrderRow, shipment: ShipmentRow, origin: string, carrierEvent: boolean) {
  let kind: EmailKind | null = null;
  if (shipment.status === "delivered" && carrierEvent) kind = "delivered";
  else if (shipment.status === "out_for_delivery" && carrierEvent) kind = "out_for_delivery";
  else if (["dispatched", "in_transit", "out_for_delivery", "delivery_attempted", "delivered"].includes(shipment.status) && shipment.tracking_number) {
    kind = "dispatched";
  }
  if (!kind) return null;

  // Nothing older than what was already sent: no "on its way" after "delivered".
  const { data } = await requireDb().from("email_messages").select("kind, status").eq("order_id", order.id).eq("status", "sent");
  const highest = Math.max(0, ...((data ?? []) as { kind: EmailKind }[]).map((row) => SHIPMENT_RANK[row.kind] ?? 0));
  if ((SHIPMENT_RANK[kind] ?? 0) <= highest) return null;

  return sendOrderEmail(kind, order, origin, { shipment });
}

/** The email history of an order, for the staff page. */
export async function emailMessagesOf(orderId: string): Promise<EmailMessageRow[]> {
  const { data, error } = await requireDb().from("email_messages").select().eq("order_id", orderId).order("created_at");
  if (error) throw new Error(`Could not read the emails: ${error.message}`);
  return (data ?? []) as EmailMessageRow[];
}

/** Lets staff send a failed or refused email again, for example after fixing the address. */
export async function resendEmail(orderId: string, kind: EmailKind, origin: string): Promise<SendResult> {
  const message = await messageOf(orderId, kind);
  if (message && (message.status === "rejected" || message.status === "skipped")) {
    await requireDb().from("email_messages").update({ status: "failed", attempts: 0 }).eq("id", message.id).eq("status", message.status);
  }
  const order = await getOrderById(orderId);
  return order ? sendOrderEmail(kind, order, origin) : "skipped";
}

/**
 * Second chance for emails: those that failed for a temporary reason, those
 * whose sending stopped half-way, and confirmations of paid orders that have
 * no email record yet (for example because the email service was down).
 */
export async function retryEmails(origin: string) {
  if (!sender()) return { tried: 0, sent: 0 };
  const database = requireDb();
  const since = new Date(Date.now() - GIVE_UP_AFTER_MS).toISOString();
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();

  const [failed, stale, paid] = await Promise.all([
    database.from("email_messages").select().eq("status", "failed").lt("attempts", MAX_ATTEMPTS).gte("created_at", since).limit(25),
    database.from("email_messages").select().eq("status", "sending").lt("updated_at", staleBefore).gte("created_at", since).limit(25),
    database.from("orders").select("id").eq("status", "paid").gte("paid_at", since).order("paid_at").limit(100),
  ]);
  for (const result of [failed, stale, paid]) if (result.error) throw new Error(`Could not list emails to retry: ${result.error.message}`);

  const due = [...((failed.data ?? []) as EmailMessageRow[]), ...((stale.data ?? []) as EmailMessageRow[])].map((row) => ({
    orderId: row.order_id,
    kind: row.kind,
  }));

  const paidIds = ((paid.data ?? []) as { id: string }[]).map((row) => row.id);
  if (paidIds.length) {
    const confirmed = await database.from("email_messages").select("order_id").eq("kind", "confirmation").in("order_id", paidIds);
    if (confirmed.error) throw new Error(`Could not list confirmations: ${confirmed.error.message}`);
    const has = new Set(((confirmed.data ?? []) as { order_id: string }[]).map((row) => row.order_id));
    for (const id of paidIds) if (!has.has(id)) due.push({ orderId: id, kind: "confirmation" });
  }

  let sent = 0;
  for (const { orderId, kind } of due.slice(0, 25)) {
    const order = await getOrderById(orderId);
    if (!order) continue;
    if ((await sendOrderEmail(kind, order, origin)) === "sent") sent++;
  }
  return { tried: Math.min(due.length, 25), sent };
}

/** Whether the confirmation email of an order went out, for the confirmation page. */
export async function confirmationSent(orderId: string) {
  const { data } = await requireDb()
    .from("email_messages")
    .select("status")
    .eq("order_id", orderId)
    .eq("kind", "confirmation")
    .maybeSingle<{ status: EmailStatus }>();
  return data?.status === "sent";
}

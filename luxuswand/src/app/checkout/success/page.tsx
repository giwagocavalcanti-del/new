import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import type Stripe from "stripe";
import { ClearBasket } from "@/components/ClearBasket";
import { RefreshButton } from "@/components/RefreshButton";
import { dispatchSentence } from "@/content/policies";
import { formatMoney } from "@/lib/pricing";
import { db, type OrderRow } from "@/server/db";
import { confirmationSent, emailEnabled } from "@/server/email";
import { fulfilPaidSession } from "@/server/fulfilment";
import { getOrderBySession } from "@/server/orders";
import { pageOrigin, stripeClient } from "@/server/stripe";

export const metadata: Metadata = { title: "Bestellbestätigung", robots: { index: false } };

type SearchParams = PageProps<"/checkout/success">["searchParams"];

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="display text-4xl md:text-5xl">{title}</h1>
      <div className="text-muted mt-5 space-y-3 leading-relaxed">{children}</div>
    </>
  );
}

function OrderNumber({ order }: { order: OrderRow }) {
  return (
    <div className="border-line bg-surface mx-auto mt-8 max-w-sm rounded-2xl border px-6 py-5">
      <p className="text-muted text-xs tracking-[0.16em] uppercase">Bestellnummer</p>
      <p className="mt-1 text-2xl font-semibold tracking-wider">{order.ref}</p>
    </div>
  );
}

const Buttons = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-9 flex flex-wrap justify-center gap-3">{children}</div>
);

const backToShop = (
  <Link href="/shop" className="btn btn-outline">
    Zurück zum Shop
  </Link>
);

const trackButton = (order: OrderRow) => (
  <Link href={`/track/${order.tracking_token}`} className="btn btn-brass">
    Bestellung verfolgen
  </Link>
);

// The page only says "paid" after asking Stripe: arriving at this address is not
// proof of payment. Asking Stripe here also confirms the order when the webhook
// is late, and is safe to repeat: reloading the page never creates or confirms
// anything twice.
async function OrderStatus({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { session_id: sessionId } = await searchParams;
  const stripe = stripeClient();

  const unknown = (
    <>
      <Message title="Wir konnten diese Bestellung nicht finden">
        <p>
          Diese Seite bestätigt eine Bestellung direkt nach der Zahlung. Wenn du bezahlt hast und das hier siehst, melde
          dich bitte bei uns, dann prüfen wir deine Bestellung.
        </p>
      </Message>
      <Buttons>{backToShop}</Buttons>
    </>
  );

  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !stripe) return unknown;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return unknown;
  }

  let order = db() ? await getOrderBySession(session.id).catch(() => null) : null;
  if (order && session.status === "complete" && (order.status === "awaiting_payment" || order.status === "processing")) {
    await fulfilPaidSession(session, stripe, await pageOrigin()).catch((error) => console.error("Confirmation page could not confirm", error));
    order = await getOrderBySession(session.id).catch(() => order);
  }

  if (!order) {
    // Paid, but the shop could not read its order: say what Stripe confirms and nothing more.
    return session.payment_status === "paid" ? (
      <>
        <Message title="Danke! Deine Zahlung ist eingegangen.">
          {session.amount_total !== null && <p>Wir haben deine Zahlung über {formatMoney(session.amount_total)} erhalten.</p>}
          <p>Deine Bestelldaten können wir gerade nicht anzeigen. Bitte lade die Seite in ein paar Minuten neu.</p>
        </Message>
        <Buttons>
          <RefreshButton />
          {backToShop}
        </Buttons>
      </>
    ) : (
      unknown
    );
  }

  switch (order.status) {
    case "paid": {
      const mailed = await confirmationSent(order.id).catch(() => false);
      return (
        <>
          <Message title="Danke! Deine Bestellung ist bestätigt.">
            {order.total_pence !== null && <p>Wir haben deine Zahlung über {formatMoney(order.total_pence)} erhalten.</p>}
            {mailed && <p>Wir haben dir eine Bestätigung an {order.customer_email} geschickt.</p>}
            {dispatchSentence() && <p>{dispatchSentence()}</p>}
          </Message>
          <OrderNumber order={order} />
          <p className="text-muted mt-4 text-sm">
            Über „Bestellung verfolgen“ siehst du jederzeit den Stand deiner Lieferung. Bewahre die Bestellnummer auf:
            Zusammen mit deiner E-Mail-Adresse findest du die Bestellung auch unter „Sendung verfolgen“.
          </p>
          <Buttons>
            {trackButton(order)}
            {backToShop}
          </Buttons>
          <ClearBasket />
        </>
      );
    }
    case "processing":
      return (
        <>
          <Message title="Danke! Deine Zahlung wird bearbeitet.">
            <p>
              Du hast eine Zahlungsart gewählt, die nicht sofort bestätigt wird (zum Beispiel eine Lastschrift). Das
              kann einige Werktage dauern. Erst wenn deine Bank die Zahlung bestätigt, bereiten wir den Versand vor.
            </p>
            <p>
              Den Stand der Zahlung siehst du jederzeit über „Bestellung verfolgen“
              {emailEnabled() && ". Sobald die Zahlung bestätigt ist, schicken wir dir eine E-Mail"}.
            </p>
          </Message>
          <OrderNumber order={order} />
          <Buttons>
            {trackButton(order)}
            {backToShop}
          </Buttons>
          <ClearBasket />
        </>
      );
    case "payment_failed":
      return (
        <>
          <Message title="Deine Zahlung wurde nicht ausgeführt">
            <p>
              Deine Bank hat die Zahlung für die Bestellung {order.ref} nicht ausgeführt. Es wurde nichts berechnet und
              es wird nichts versandt. Dein Warenkorb ist noch gespeichert, du kannst es mit einer anderen Zahlungsart
              erneut versuchen.
            </p>
          </Message>
          <Buttons>
            <Link href="/checkout" className="btn btn-brass">
              Erneut zur Kasse
            </Link>
            {backToShop}
          </Buttons>
        </>
      );
    case "refunded":
      return (
        <>
          <Message title="Diese Bestellung wurde erstattet">
            <p>Der Betrag der Bestellung {order.ref} wurde auf dein ursprüngliches Zahlungsmittel zurückgezahlt.</p>
          </Message>
          <Buttons>{backToShop}</Buttons>
        </>
      );
    default:
      // awaiting_payment or cancelled
      return session.status === "open" && session.url ? (
        <>
          <Message title="Deine Zahlung ist noch nicht abgeschlossen">
            <p>
              Bisher wurde nichts bestätigt und nichts berechnet.
              {order.last_payment_error && " Die letzte Zahlung wurde abgelehnt, du kannst es mit einer anderen Karte versuchen."}
            </p>
          </Message>
          <Buttons>
            <a href={session.url} className="btn btn-brass">
              Zurück zur Bezahlung
            </a>
            {backToShop}
          </Buttons>
        </>
      ) : (
        <>
          <Message title="Diese Bestellung wurde nicht abgeschlossen">
            <p>Es wurde nichts berechnet und es wird nichts versandt. Dein Warenkorb ist noch gespeichert.</p>
          </Message>
          <Buttons>
            <Link href="/checkout" className="btn btn-brass">
              Zur Kasse
            </Link>
            {backToShop}
          </Buttons>
        </>
      );
  }
}

export default function CheckoutSuccessPage(props: PageProps<"/checkout/success">) {
  return (
    <div className="shell max-w-2xl py-24 text-center">
      <Suspense fallback={<p className="text-muted">Deine Zahlung wird geprüft…</p>}>
        <OrderStatus searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { CheckIcon } from "@/components/icons";
import { site } from "@/config/site";
import { PROBLEM_STATUSES, STATUS_LABEL, type DeliveryStatus } from "@/lib/delivery-status";
import { buildTimeline, longDate, type StepDate, type Timeline } from "@/lib/order-timeline";
import { db } from "@/server/db";
import { getTrackingView, type TrackingView } from "@/server/orders";

// The tracking link is private to the customer, so it stays out of search engines.
export const metadata: Metadata = { title: "Sendungsverfolgung", robots: { index: false, follow: false } };

const SHOP_TIME_ZONE = "Europe/Berlin";
const dayFormat = new Intl.DateTimeFormat(site.locale, { timeZone: SHOP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const momentFormat = new Intl.DateTimeFormat(site.locale, {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
// A plain date has no time zone: formatting it in UTC keeps it on the same calendar day.
const dateOnlyFormat = new Intl.DateTimeFormat(site.locale, {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const PROBLEM_TEXT: Partial<Record<DeliveryStatus, string>> = {
  exception: "Der Kurierdienst hat eine Verzögerung gemeldet. Unten findest du den neuesten Stand.",
  returned: "Das Paket ist auf dem Rückweg zu uns. Bitte melde dich bei uns, damit wir das klären können.",
  cancelled: "Diese Zustellung wurde storniert. Bitte melde dich bei uns, falls du das nicht erwartet hast.",
};

const PAYMENT_LABEL: Record<TrackingView["order"]["status"], string> = {
  awaiting_payment: "Noch nicht abgeschlossen",
  processing: "Wird bearbeitet",
  paid: "Bestätigt",
  payment_failed: "Nicht ausgeführt",
  cancelled: "Nicht abgeschlossen",
  refunded: "Erstattet",
};

const PAYMENT_TEXT: Partial<Record<TrackingView["order"]["status"], string>> = {
  awaiting_payment:
    "Wir warten auf die Bestätigung deiner Zahlung. Das dauert meist nur wenige Sekunden: Aktualisiere die Seite gleich noch einmal.",
  processing:
    "Deine Zahlungsart wird nicht sofort bestätigt (zum Beispiel eine Lastschrift). Das kann einige Werktage dauern. Sobald deine Bank die Zahlung bestätigt, bereiten wir den Versand vor und du siehst es hier.",
  payment_failed:
    "Deine Bank hat die Zahlung nicht ausgeführt. Es wurde nichts berechnet und es wird nichts versandt. Du kannst im Shop neu bestellen.",
  cancelled: "Diese Bestellung wurde nicht abgeschlossen. Es wurde nichts berechnet und es wird nichts versandt.",
  refunded: "Diese Bestellung wurde auf dein ursprüngliches Zahlungsmittel erstattet.",
};

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="display text-4xl md:text-5xl">{title}</h1>
      <div className="text-muted mt-5 space-y-3 leading-relaxed">{children}</div>
      <Link href="/track" className="btn btn-dark mt-9">
        Andere Bestellung verfolgen
      </Link>
    </div>
  );
}

function StepWhen({ date }: { date: StepDate }) {
  if (date.kind === "at") {
    return <time dateTime={date.at}>{momentFormat.format(new Date(date.at))}</time>;
  }
  // Forecasts are always said to be forecasts.
  return (
    <span className="italic">
      Voraussichtlich {date.kind === "expected" ? longDate(date.on) : `zwischen ${longDate(date.from)} und ${longDate(date.to)}`}
    </span>
  );
}

function TimelineList({ timeline }: { timeline: Timeline }) {
  return (
    <ol className="mt-6">
      {timeline.steps.map((step, index) => {
        const reached = step.state !== "upcoming";
        const last = index === timeline.steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={step.state === "current" ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute top-8 bottom-0 left-[0.9375rem] w-0.5 ${reached && timeline.steps[index + 1].state !== "upcoming" ? "bg-bark" : "bg-line"}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative grid size-8 shrink-0 place-items-center rounded-full border-2 ${
                step.state === "current"
                  ? "border-bark bg-paper text-bark"
                  : reached
                    ? "border-bark bg-bark text-paper"
                    : "border-line bg-paper text-muted border-dashed"
              }`}
            >
              {step.state === "done" ? (
                <CheckIcon width={16} height={16} strokeWidth={2.5} />
              ) : (
                <span className={`size-2.5 rounded-full ${step.state === "current" ? "bg-bark" : "bg-line"}`} />
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p className={step.state === "upcoming" ? "text-muted font-medium" : "font-semibold"}>
                {step.title}
                <span className="sr-only">
                  {step.state === "done" ? " (erledigt)" : step.state === "current" ? " (aktueller Stand)" : " (noch offen)"}
                </span>
              </p>
              {step.text && reached && <p className="text-muted mt-0.5 text-sm leading-relaxed">{step.text}</p>}
              {step.date && (
                <p className="text-muted mt-1 text-xs">
                  <StepWhen date={step.date} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Shipment({ view, timeline, token, received }: { view: TrackingView; timeline: Timeline; token: string; received: string | null }) {
  const { shipment, events } = view;
  const status: DeliveryStatus = shipment?.status ?? "pending";
  const hasCourierDetails = shipment && (shipment.carrier || shipment.tracking_number || shipment.estimated_delivery);

  return (
    <>
      <section className="border-line bg-surface mt-8 rounded-2xl border p-6">
        <p className="eyebrow">Aktueller Stand</p>
        <h2 className="display mt-1.5 text-2xl">{timeline.headline.title}</h2>
        {timeline.headline.text && <p className="text-muted mt-2 leading-relaxed">{timeline.headline.text}</p>}

        {timeline.checking && (
          <p role="status" className="border-line bg-paper mt-4 rounded-xl border px-4 py-3 text-sm">
            <strong className="font-semibold">Empfang noch nicht bestätigt</strong> – wir prüfen den Stand der Zustellung.
          </p>
        )}
        {received === "1" && timeline.closed && (
          <p role="status" className="text-bark mt-4 text-sm font-medium">
            Danke! Wir haben deine Bestätigung gespeichert.
          </p>
        )}
        {received === "error" && (
          <p role="alert" className="text-sale mt-4 text-sm">
            Deine Bestätigung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.
          </p>
        )}

        {timeline.canConfirm && (
          <form action={`/api/track/${encodeURIComponent(token)}/received`} method="post" className="mt-5">
            <button type="submit" className="btn btn-dark">
              Ich habe meine Bestellung erhalten
            </button>
            <p className="text-muted mt-2 text-xs">Damit schließt du die Sendungsverfolgung ab.</p>
          </form>
        )}
      </section>

      {PROBLEM_STATUSES.has(status) && !timeline.closed && (
        <p role="status" className="border-sale/30 bg-sale/5 text-sale mt-6 rounded-xl border px-4 py-3.5 text-sm">
          <strong className="font-semibold">{STATUS_LABEL[status]}.</strong> {PROBLEM_TEXT[status]}
        </p>
      )}

      <section className="mt-10">
        <h2 className="display text-2xl">Verlauf</h2>
        <TimelineList timeline={timeline} />
        <p className="text-muted mt-6 text-xs leading-relaxed">
          Angaben mit „voraussichtlich“ sind unsere Prognose nach Werktagen, keine Meldung des Kurierdienstes. Alles andere
          wurde vom Kurierdienst, von uns oder von dir bestätigt.
        </p>
      </section>

      {hasCourierDetails && (
        <dl className="border-line bg-surface mt-8 grid gap-5 rounded-2xl border p-6 text-sm sm:grid-cols-3">
          {shipment.carrier && (
            <div>
              <dt className="text-muted">Kurierdienst</dt>
              <dd className="mt-1 font-medium">{shipment.carrier}</dd>
            </div>
          )}
          {shipment.tracking_number && (
            <div>
              <dt className="text-muted">Sendungsnummer</dt>
              <dd className="mt-1 font-medium break-all">
                {shipment.tracking_url ? (
                  <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    {shipment.tracking_number}
                  </a>
                ) : (
                  shipment.tracking_number
                )}
              </dd>
            </div>
          )}
          {shipment.estimated_delivery && !timeline.closed && (
            <div>
              <dt className="text-muted">Zustellung laut Kurierdienst</dt>
              <dd className="mt-1 font-medium">
                {dateOnlyFormat.format(new Date(`${shipment.estimated_delivery}T12:00:00Z`))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {events.length > 0 && (
        <section className="mt-10">
          <h2 className="display text-2xl">Meldungen zur Sendung</h2>
          <ol className="border-line mt-5 space-y-6 border-l pl-6">
            {events.map((event, index) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 -left-[1.82rem] size-2.5 rounded-full ${index === 0 ? "bg-bark" : "bg-line"}`}
                />
                <p className="font-medium">{STATUS_LABEL[event.status]}</p>
                {event.description && <p className="text-muted mt-0.5 text-sm">{event.description}</p>}
                <p className="text-muted mt-1 text-xs">
                  <time dateTime={event.occurred_at}>{momentFormat.format(new Date(event.occurred_at))}</time>
                  {event.location && ` · ${event.location}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

async function Tracking({ params, searchParams }: PageProps<"/track/[token]">) {
  await connection();
  const { token } = await params;
  const receivedParam = (await searchParams).received;
  const received = typeof receivedParam === "string" ? receivedParam : null;

  if (!db()) {
    return (
      <Notice title="Die Sendungsverfolgung ist noch nicht verfügbar">
        <p>Dieser Shop wird noch eingerichtet, es gibt also noch keine Bestellungen zu verfolgen.</p>
      </Notice>
    );
  }

  const view = await getTrackingView(token);
  if (!view) {
    return (
      <Notice title="Wir konnten diese Bestellung nicht finden">
        <p>Der Link ist möglicherweise unvollständig. Du kannst deine Bestellung mit ihrer Nummer und deiner E-Mail-Adresse suchen.</p>
      </Notice>
    );
  }

  const { order, items } = view;
  const timeline =
    order.status === "paid"
      ? buildTimeline({
          paidAt: order.paid_at ?? order.created_at,
          now: new Date(),
          events: view.events,
          receivedConfirmedAt: view.shipment?.received_confirmed_at ?? null,
          nextAttemptOn: view.shipment?.next_attempt_on ?? null,
          config: site.tracking,
        })
      : null;
  const destination = [order.postcode, order.city].filter(Boolean).join(" ");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Sendungsverfolgung</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Bestellung {order.ref}</h1>
          <p className="text-muted mt-3 text-sm">
            Bestellt am {dayFormat.format(new Date(order.created_at))}
            {destination && ` · Lieferung nach ${destination}`}
            {order.delivery_service && ` · ${order.delivery_service}`}
          </p>
        </div>
        <RefreshButton />
      </div>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="border-line bg-surface rounded-xl border px-4 py-3.5">
          <dt className="text-muted text-xs tracking-[0.14em] uppercase">Zahlung</dt>
          <dd className="mt-1 font-semibold">{PAYMENT_LABEL[order.status]}</dd>
        </div>
        <div className="border-line bg-surface rounded-xl border px-4 py-3.5">
          <dt className="text-muted text-xs tracking-[0.14em] uppercase">Lieferung</dt>
          <dd className="mt-1 font-semibold">
            {timeline ? timeline.headline.title : "Noch nicht freigegeben"}
          </dd>
        </div>
      </dl>

      {PAYMENT_TEXT[order.status] && (
        <p role="status" className="border-line bg-surface mt-4 rounded-xl border px-4 py-3.5 text-sm leading-relaxed">
          {PAYMENT_TEXT[order.status]}
        </p>
      )}
      {timeline && <Shipment view={view} timeline={timeline} token={token} received={received} />}

      <section className="mt-10">
        <h2 className="display text-2xl">In dieser Bestellung</h2>
        <ul className="divide-line border-line mt-4 divide-y border-y text-sm">
          {items.map((item) => (
            <li key={item.name} className="flex justify-between gap-4 py-3.5">
              <span>{item.name}</span>
              <span className="text-muted">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-muted mt-10 text-sm">
        Stimmt etwas nicht?{" "}
        <Link href="/info/contact" className="text-ink underline underline-offset-2">
          Schreib uns
        </Link>{" "}
        und nenne deine Bestellnummer.
      </p>
    </>
  );
}

export default function TrackingPage(props: PageProps<"/track/[token]">) {
  return (
    <div className="shell max-w-3xl py-14">
      <Suspense fallback={<p className="text-muted text-center">Deine Bestellung wird geladen…</p>}>
        <Tracking {...props} />
      </Suspense>
    </div>
  );
}

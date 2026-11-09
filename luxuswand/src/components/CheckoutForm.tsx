"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { swatchStyle } from "@/components/SlatArt";
import { LockIcon } from "@/components/icons";
import { dimensions } from "@/data/catalogue";
import { currentAttribution } from "@/lib/attribution";
import { useBasket } from "@/lib/basket";
import {
  EMPTY_DETAILS,
  parseCheckoutDetails,
  type CheckoutDetails,
  type CheckoutField,
  type FieldErrors,
} from "@/lib/checkout-form";
import { deliveryOptionsFor, formatMoney } from "@/lib/pricing";

// The checkout page: the customer reviews the basket, enters contact and
// delivery details, picks the delivery and sees the total before paying. The
// payment itself happens on Stripe's page, so card details never reach the shop.

export const DETAILS_KEY = "checkout.details.v1";
export const CHECKOUT_KEY = "checkout.key.v1";

const ERRORS: Record<string, string> = {
  payments_not_connected:
    "Kartenzahlungen sind noch nicht aktiviert. Dieser Shop wird noch eingerichtet, es wurde nichts berechnet.",
  orders_not_connected: "Dieser Shop kann noch keine Bestellungen annehmen, es wurde nichts berechnet.",
  preview_only: "Dies ist eine Vorschau des Shops, Bestellungen sind noch nicht möglich. Es wurde nichts berechnet.",
  invalid_basket: "Etwas in deinem Warenkorb ist nicht mehr verfügbar. Bitte prüfe ihn und versuche es noch einmal.",
  invalid_delivery: "Bitte wähle eine Versandart.",
  invalid_details: "Bitte prüfe die markierten Felder.",
  prices_updating:
    "Unsere Preise werden gerade aktualisiert. Bitte versuche es etwas später noch einmal, es wurde nichts berechnet.",
  checkout_busy: "Deine Bestellung wird gerade vorbereitet. Bitte versuche es in ein paar Sekunden noch einmal.",
};
const GENERIC = "Die Bezahlseite konnte nicht geöffnet werden. Es wurde nichts berechnet. Bitte versuche es gleich noch einmal.";

/** One value per browser tab: sending the same checkout again reuses the same order. */
function checkoutKey() {
  try {
    let key = window.sessionStorage.getItem(CHECKOUT_KEY);
    if (!key) {
      key = crypto.randomUUID().replace(/-/g, "");
      window.sessionStorage.setItem(CHECKOUT_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

function Field({
  name,
  label,
  value,
  error,
  onChange,
  optional,
  ...input
}: {
  name: keyof CheckoutDetails;
  label: string;
  value: string;
  error?: string;
  onChange: (name: keyof CheckoutDetails, value: string) => void;
  optional?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">) {
  const id = useId();
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-medium">
        {label}
        {optional && <span className="text-muted font-normal"> (optional)</span>}
      </span>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-1.5 block w-full rounded-lg border bg-white px-3.5 py-3 ${error ? "border-sale" : "border-line"}`}
        {...input}
      />
      {error && (
        <span id={`${id}-error`} className="text-sale mt-1.5 block text-xs">
          {error}
        </span>
      )}
    </label>
  );
}

const noop = () => () => {};

function readDraft(): { details: CheckoutDetails; deliveryId: string | null } {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(DETAILS_KEY) ?? "null") as
      | (Partial<CheckoutDetails> & { deliveryId?: unknown })
      | null;
    if (saved && typeof saved === "object") {
      const { deliveryId, ...details } = saved;
      return {
        details: { ...EMPTY_DETAILS, ...details, country: EMPTY_DETAILS.country },
        deliveryId: typeof deliveryId === "string" ? deliveryId : null,
      };
    }
  } catch {
    // nothing saved, storage refused, or rendering on the server
  }
  return { details: EMPTY_DETAILS, deliveryId: null };
}

export function CheckoutForm() {
  // The basket lives in the browser: until it is read, show neither the form nor "empty".
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const { raw, lines, count, subtotalPence, savedPence } = useBasket();
  // What was typed survives a reload of this tab, and only of this tab. Read on
  // the first render in the browser; the server only ever renders "loading".
  const [draft] = useState(readDraft);
  const [details, setDetails] = useState<CheckoutDetails>(draft.details);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = deliveryOptionsFor(subtotalPence);
  const [deliveryId, setDeliveryId] = useState<string | null>(draft.deliveryId);
  const delivery = options.find((option) => option.id === deliveryId) ?? options[0] ?? null;
  const totalPence = subtotalPence + (delivery?.pricePence ?? 0);

  function save(nextDetails: CheckoutDetails, nextDelivery: string | null) {
    try {
      window.sessionStorage.setItem(DETAILS_KEY, JSON.stringify({ ...nextDetails, deliveryId: nextDelivery }));
    } catch {
      // storage refused: the form still works
    }
  }

  function change(name: keyof CheckoutDetails, value: string) {
    const next = { ...details, [name]: value };
    setDetails(next);
    save(next, deliveryId);
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function chooseDelivery(id: string) {
    setDeliveryId(id);
    save(details, id);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const checked = parseCheckoutDetails(details);
    if ("errors" in checked) {
      setErrors(checked.errors);
      setMessage(ERRORS.invalid_details);
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    if (!delivery) return setMessage(ERRORS.invalid_delivery);

    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: raw,
          details,
          deliveryOptionId: delivery.id,
          checkoutKey: checkoutKey(),
          attribution: currentAttribution(),
        }),
      });
      const data: { url?: unknown; error?: unknown; fields?: FieldErrors; items?: { name: string; available: number }[] } =
        await response.json().catch(() => ({}));
      if (response.ok && typeof data.url === "string") {
        window.location.assign(data.url);
        return;
      }
      if (data.error === "invalid_details" && data.fields) setErrors(data.fields);
      if (data.error === "out_of_stock" && data.items?.length) {
        setMessage(
          `Nicht genug auf Lager: ${data.items
            .map((item) => `${item.name} (noch ${item.available} verfügbar)`)
            .join(", ")}. Bitte passe die Menge in deinem Warenkorb an. Es wurde nichts berechnet.`,
        );
      } else {
        setMessage(ERRORS[String(data.error)] ?? GENERIC);
      }
    } catch {
      setMessage(GENERIC);
    }
    setBusy(false);
  }

  if (!hydrated) return <p className="text-muted py-16 text-center">Kasse wird geladen…</p>;

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="display text-4xl md:text-5xl">Kasse</h1>
        <p className="text-muted mt-5">Dein Warenkorb ist leer.</p>
        <Link href="/shop" className="btn btn-dark mt-8">
          Paneele ansehen
        </Link>
      </div>
    );
  }

  const fieldProps = (name: keyof CheckoutDetails) => ({
    name,
    value: details[name] ?? "",
    error: errors[name as CheckoutField],
    onChange: change,
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
      <div className="min-w-0">
        <p className="eyebrow">Kasse</p>
        <h1 className="display mt-2 text-4xl md:text-5xl">Bestellung abschließen</h1>

        <fieldset className="mt-10">
          <legend className="display text-2xl">Kontakt</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="E-Mail-Adresse" type="email" autoComplete="email" inputMode="email" {...fieldProps("email")} />
              <p className="text-muted mt-1.5 text-xs">Hierhin schicken wir die Bestätigung und den Link zur Sendungsverfolgung.</p>
            </div>
            <Field label="Telefon" type="tel" autoComplete="tel" optional {...fieldProps("phone")} />
          </div>
        </fieldset>

        <fieldset className="mt-10">
          <legend className="display text-2xl">Lieferadresse</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Vor- und Nachname" autoComplete="name" {...fieldProps("name")} />
            </div>
            <div className="sm:col-span-2">
              <Field label="Straße und Hausnummer" autoComplete="address-line1" {...fieldProps("line1")} />
            </div>
            <div className="sm:col-span-2">
              <Field label="Adresszusatz" autoComplete="address-line2" optional {...fieldProps("line2")} />
            </div>
            <Field label="Postleitzahl" autoComplete="postal-code" inputMode="numeric" maxLength={5} {...fieldProps("postcode")} />
            <Field label="Ort" autoComplete="address-level2" {...fieldProps("city")} />
            <p className="text-muted text-sm sm:col-span-2">Land: Deutschland. Wir liefern derzeit nur innerhalb Deutschlands.</p>
          </div>
        </fieldset>

        <fieldset className="mt-10">
          <legend className="display text-2xl">Versandart</legend>
          <div className="mt-5 space-y-3">
            {options.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-4 text-sm ${
                  delivery?.id === option.id ? "border-bark bg-surface" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="delivery"
                  value={option.id}
                  checked={delivery?.id === option.id}
                  onChange={() => chooseDelivery(option.id)}
                  className="accent-bark size-4"
                />
                <span className="flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="text-muted block text-xs">
                    Zustellung {option.minDays === option.maxDays ? option.minDays : `${option.minDays}–${option.maxDays}`}{" "}
                    Werktage nach dem Versand
                  </span>
                </span>
                <span className="font-semibold">{option.pricePence === 0 ? "Kostenlos" : formatMoney(option.pricePence)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <aside className="lg:pt-24">
        <div className="border-line bg-surface rounded-2xl border p-6 lg:sticky lg:top-24">
          <h2 className="display text-2xl">
            Deine Bestellung <span className="text-muted text-base font-normal">({count})</span>
          </h2>
          <ul className="divide-line mt-4 divide-y text-sm">
            {lines.map(({ product, qty, totalPence, percentOff }) => (
              <li key={product.slug} className="flex gap-3 py-3.5">
                <div className="size-14 shrink-0 rounded-lg" style={swatchStyle(product.finish)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-muted text-xs">
                    {qty} × {dimensions(product.format)}
                    {percentOff !== null && <span className="text-sale"> · {percentOff} % Mengenrabatt</span>}
                  </p>
                </div>
                <p className="font-medium whitespace-nowrap">{formatMoney(totalPence)}</p>
              </li>
            ))}
          </ul>
          <dl className="border-line mt-2 space-y-2 border-t pt-4 text-sm">
            {savedPence > 0 && (
              <div className="text-sale flex justify-between">
                <dt>Mengenrabatt</dt>
                <dd>−{formatMoney(savedPence)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Zwischensumme</dt>
              <dd>{formatMoney(subtotalPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{delivery?.label ?? "Versand"}</dt>
              <dd>{delivery ? (delivery.pricePence === 0 ? "Kostenlos" : formatMoney(delivery.pricePence)) : "—"}</dd>
            </div>
            <div className="border-line flex justify-between border-t pt-3 text-lg font-semibold">
              <dt>Gesamt</dt>
              <dd>{formatMoney(totalPence)}</dd>
            </div>
          </dl>

          {message && (
            <p role="alert" className="border-sale/30 bg-sale/5 text-sale mt-5 rounded-lg border px-3 py-2.5 text-sm">
              {message}
            </p>
          )}
          <button disabled={busy} className="btn btn-brass mt-5 w-full py-4">
            <LockIcon width={16} height={16} />
            {busy ? "Bezahlseite wird geöffnet…" : `Weiter zur Zahlung · ${formatMoney(totalPence)}`}
          </button>
          <p className="text-muted mt-3 text-xs leading-relaxed">
            Du bezahlst auf der sicheren Bezahlseite von Stripe. Deine Kartendaten gehen direkt an Stripe, wir sehen und
            speichern sie nicht. Dort kannst du alles noch einmal prüfen, bevor du bezahlst.
          </p>
          <Link href="/shop" className="text-muted hover:text-ink mt-4 block text-center text-xs underline underline-offset-2">
            Weiter einkaufen
          </Link>
        </div>
      </aside>
    </form>
  );
}

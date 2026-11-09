// Customer-facing wording built from the shop configuration, so the FAQ,
// the policy pages and the checkout can never disagree with each other.

import { site } from "@/config/site";
import { construction, formats } from "@/data/catalogue";
import { formatMoney, formatRoundMoney } from "@/lib/pricing";

/** Shared by the FAQ and the mounting steps on the home page. */
export const cuttingSentence =
  "Kürzen kannst du ein Paneel mit einer feinzahnigen Säge. Für die Breite schneidest du den Filz zwischen zwei Lamellen mit einem scharfen Messer durch.";

const days = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

export function dispatchSentence(): string | null {
  const { dispatchDays } = site.delivery;
  if (!dispatchDays) return null;
  return `Bestellungen verlassen unser Lager innerhalb von ${days(dispatchDays.min, dispatchDays.max)} Werktagen nach Zahlungseingang.`;
}

export function deliveryOptionSentences(): string[] {
  return site.delivery.options.map(
    (option) =>
      `${option.label}: ${formatMoney(option.pricePence)}, Zustellung ${days(option.minDays, option.maxDays)} Werktage nach dem Versand.`,
  );
}

export function freeDeliverySentence(): string | null {
  const { freeOverPence } = site.delivery;
  return freeOverPence === null ? null : `Kostenloser Versand ab ${formatRoundMoney(freeOverPence)} Bestellwert.`;
}

export function deliverySummary(): string {
  const parts = [dispatchSentence(), ...deliveryOptionSentences(), freeDeliverySentence()].filter(Boolean);
  return parts.length ? parts.join(" ") : "Lieferzeiten und Versandkosten siehst du an der Kasse.";
}

export function returnsSummary(): string {
  return `Du hast ${site.returnsDays} Tage ab dem Tag, an dem deine Bestellung ankommt, um uns mitzuteilen, dass du sie widerrufen möchtest, und danach weitere 14 Tage für die Rücksendung. Bitte schicke die Paneele möglichst unbenutzt und in wiederverkaufsfähigem Zustand zurück.`;
}

export type FaqItem = { question: string; answer: string };

export function faqItems(): FaqItem[] {
  const widths = [...new Set(Object.values(formats).map((format) => format.widthMm))];
  const widthText = widths.length === 1 ? `${widths[0]} mm` : widths.map((width) => `${width} mm`).join(" oder ");

  return [
    { question: "Wie lange dauert die Lieferung?", answer: deliverySummary() },
    {
      question: "Wie viele Paneele brauche ich?",
      answer: `Jedes Paneel ist ${widthText} breit. Miss die Breite deiner Wand, teile sie durch die Paneelbreite und runde auf. Auf jeder Produktseite gibt es einen Rechner, der das für dich erledigt.`,
    },
    {
      question: "Kann ich die Paneele zuschneiden?",
      answer: `Ja. ${cuttingSentence}`,
    },
    {
      question: "Wie kann ich meine Bestellung verfolgen?",
      answer:
        "Deine Bestellnummer siehst du direkt nach der Zahlung, zusammen mit einem Link zu deiner Sendungsverfolgung. Du kannst auch im Menü „Sendung verfolgen“ öffnen und die Bestellnummer mit der E-Mail-Adresse deiner Bestellung eingeben.",
    },
    { question: "Kann ich meine Bestellung zurückgeben?", answer: returnsSummary() },
    {
      question: "Wie kann ich bezahlen?",
      answer:
        "Du bezahlst per Karte auf einer sicheren Bezahlseite von Stripe. Deine Kartendaten gehen direkt an Stripe, wir sehen und speichern sie nicht.",
    },
  ];
}

export type MountingStep = { id: "prepare" | "cut" | "mount" | "done"; title: string; text: string };

const MOUNTING_METHOD = { adhesive: "Montagekleber", screws: "Schrauben" } as const;

export function mountingSteps(): MountingStep[] {
  const methods = construction.mounting?.length
    ? new Intl.ListFormat(site.locale, { type: "disjunction" }).format(
        construction.mounting.map((method) => MOUNTING_METHOD[method]),
      )
    : null;

  return [
    {
      id: "prepare",
      title: "Vorbereiten",
      text: "Die Wand sollte sauber, trocken und eben sein. Miss ihre Breite: Der Rechner auf jeder Produktseite sagt dir, wie viele Paneele du brauchst.",
    },
    { id: "cut", title: "Zuschneiden", text: `Passe die Paneele an deine Wand an. ${cuttingSentence}` },
    {
      id: "mount",
      title: "Anbringen",
      text: methods
        ? `Befestige das erste Paneel mit ${methods} und richte es mit der Wasserwaage senkrecht aus. Die nächsten setzt du direkt daneben.`
        : "Setze das erste Paneel an und richte es mit der Wasserwaage senkrecht aus. Die nächsten setzt du direkt daneben.",
    },
    { id: "done", title: "Genießen", text: "Tritt einen Schritt zurück und genieße deine neue Wand." },
  ];
}

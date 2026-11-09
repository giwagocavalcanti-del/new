"use client";

import Link from "next/link";
import { site } from "@/config/site";
import { answerConsent, useConsent } from "@/lib/attribution";

/** Asks once whether adverts may be measured. Both answers are equally easy to give. */
export function ConsentNotice() {
  const consent = useConsent();
  if (!site.attribution.enabled || consent !== "undecided") return null;

  return (
    <section
      aria-label="Messung unserer Werbung"
      className="border-line bg-surface fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border p-5 shadow-lg sm:inset-x-6 sm:bottom-6"
    >
      <p className="text-sm leading-relaxed">
        <strong className="font-semibold">Dürfen wir unsere Werbung messen?</strong> Wenn du zustimmst, merken wir uns,
        welche Anzeige oder welcher Link dich hergeführt hat. Wenn du bestellst, teilen wir die Bestellung mit unserem
        Messdienst, damit wir sehen, welche Anzeigen funktionieren. Sonst wird nichts erfasst.{" "}
        <Link href="/info/privacy" className="underline underline-offset-2">
          Datenschutz
        </Link>
      </p>
      <div className="mt-4 flex gap-3">
        <button onClick={() => answerConsent("denied")} className="btn btn-outline flex-1 py-3">
          Ablehnen
        </button>
        <button onClick={() => answerConsent("granted")} className="btn btn-outline flex-1 py-3">
          Zustimmen
        </button>
      </div>
    </section>
  );
}

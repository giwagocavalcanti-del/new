import type { Metadata } from "next";
import { TrackLookup } from "@/components/TrackLookup";
import { emailEnabled } from "@/server/email";

export const metadata: Metadata = {
  title: "Sendung verfolgen",
  description: "Verfolge deine Lieferung mit Bestellnummer und E-Mail-Adresse.",
};

export default function TrackPage() {
  return (
    <div className="shell max-w-md py-16 text-center">
      <p className="eyebrow">Lieferung</p>
      <h1 className="display mt-2 text-5xl">Sendung verfolgen</h1>
      <p className="text-muted mt-4 leading-relaxed">
        Gib deine Bestellnummer und die E-Mail-Adresse deiner Bestellung ein. Die Bestellnummer findest du auf der
        Bestätigungsseite nach der Zahlung{emailEnabled() && " und in deiner Bestätigungs-E-Mail"}.
      </p>
      <div className="mt-9">
        <TrackLookup />
      </div>
    </div>
  );
}

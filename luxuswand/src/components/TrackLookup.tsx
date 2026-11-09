"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const MESSAGES: Record<string, string> = {
  not_found: "Wir konnten keine Bestellung mit dieser Nummer und E-Mail-Adresse finden. Prüfe beides und versuche es noch einmal.",
  not_configured: "Die Sendungsverfolgung ist noch nicht verfügbar.",
};
const GENERIC = "Wir konnten deine Bestellung gerade nicht abrufen. Bitte versuche es gleich noch einmal.";

export function TrackLookup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: form.get("ref"), email: form.get("email") }),
      });
      const data: { token?: unknown; error?: unknown } = await response.json().catch(() => ({}));
      if (response.ok && typeof data.token === "string") {
        router.push(`/track/${data.token}`);
        return;
      }
      setError(MESSAGES[String(data.error)] ?? GENERIC);
    } catch {
      setError(GENERIC);
    }
    setBusy(false);
  }

  const field = "border-line mt-1.5 block w-full rounded-lg border bg-white px-3.5 py-3";

  return (
    <form onSubmit={submit} className="space-y-5 text-left">
      <label className="block text-sm">
        <span className="font-medium">Bestellnummer</span>
        <input name="ref" required autoComplete="off" placeholder="z. B. 7KQ4-M2XP" className={`${field} uppercase`} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">E-Mail-Adresse deiner Bestellung</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      {error && (
        <p role="alert" className="border-sale/30 bg-sale/5 text-sale rounded-lg border px-3 py-2.5 text-sm">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn btn-dark w-full py-4">
        {busy ? "Wird gesucht…" : "Bestellung verfolgen"}
      </button>
    </form>
  );
}

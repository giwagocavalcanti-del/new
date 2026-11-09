import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { stripeClient } from "@/server/stripe";

export const metadata: Metadata = { title: "Bezahlvorgang abgebrochen", robots: { index: false } };

// While Stripe keeps the payment page open, the customer can go straight back to it.
async function BackToPayment({ searchParams }: { searchParams: PageProps<"/checkout/cancelled">["searchParams"] }) {
  await connection();
  const { session_id: sessionId } = await searchParams;
  const stripe = stripeClient();
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
  if (session?.status !== "open" || !session.url) return null;
  return (
    <a href={session.url} className="btn btn-brass">
      Zurück zur Bezahlung
    </a>
  );
}

export default function CheckoutCancelledPage(props: PageProps<"/checkout/cancelled">) {
  return (
    <div className="shell max-w-2xl py-24 text-center">
      <h1 className="display text-4xl md:text-5xl">Bezahlvorgang abgebrochen</h1>
      <p className="text-muted mt-5 leading-relaxed">
        Du hast die Bezahlseite verlassen, es wurde also nichts berechnet. Dein Warenkorb bleibt gespeichert.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Suspense fallback={null}>
          <BackToPayment searchParams={props.searchParams} />
        </Suspense>
        <Link href="/checkout" className="btn btn-outline">
          Zur Kasse
        </Link>
        <Link href="/shop" className="btn btn-outline">
          Zurück zum Shop
        </Link>
      </div>
    </div>
  );
}

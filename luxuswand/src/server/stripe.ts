import Stripe from "stripe";

export const isTestKey = (key: string) => key.startsWith("sk_test_") || key.startsWith("rk_test_");

/** The Stripe client, or null while no secret key is configured. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  // The end-to-end test points the client at a stand-in server. Only honoured
  // with a test key, so a live shop can never be redirected away from Stripe.
  const base = process.env.STRIPE_API_BASE;
  if (base && isTestKey(key)) {
    const url = new URL(base);
    return new Stripe(key, {
      host: url.hostname,
      port: Number(url.port),
      protocol: url.protocol === "http:" ? "http" : "https",
      maxNetworkRetries: 0,
    });
  }

  return new Stripe(key);
}

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
};

const WALLETS: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", samsung_pay: "Samsung Pay", link: "Link" };

const METHODS: Record<string, string> = {
  sepa_debit: "SEPA-Lastschrift",
  paypal: "PayPal",
  klarna: "Klarna",
  link: "Link",
  giropay: "giropay",
  sofort: "Sofortüberweisung",
  eps: "eps-Überweisung",
  ideal: "iDEAL",
  bancontact: "Bancontact",
  p24: "Przelewy24",
  revolut_pay: "Revolut Pay",
  amazon_pay: "Amazon Pay",
};

const lastFour = (value: string | null | undefined) => (value ? ` •••• ${value}` : "");

/**
 * How the customer paid, in the words shown to them: "Visa •••• 4242",
 * "Apple Pay (Visa •••• 4242)", "SEPA-Lastschrift •••• 3000". Never more than the
 * last four digits, which is all Stripe hands out. Null when Stripe says nothing.
 */
export function paymentMethodLabel(details: Stripe.Charge.PaymentMethodDetails | null | undefined): string | null {
  if (!details?.type) return null;
  if (details.type === "card" && details.card) {
    const brand = details.card.brand ? (CARD_BRANDS[details.card.brand] ?? "Karte") : "Karte";
    const card = `${brand}${lastFour(details.card.last4)}`;
    const wallet = details.card.wallet?.type ? WALLETS[details.card.wallet.type] : undefined;
    return wallet ? `${wallet} (${card})` : card;
  }
  if (details.type === "sepa_debit") return `${METHODS.sepa_debit}${lastFour(details.sepa_debit?.last4)}`;
  return METHODS[details.type] ?? details.type.replace(/_/g, " ");
}

/** What Stripe kept from a payment (in cents) and how it was paid. Null fields when they cannot be read yet. */
export async function paymentDetails(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{ feePence: number | null; method: string | null }> {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = intent.latest_charge;
    if (!charge || typeof charge === "string") return { feePence: null, method: null };
    const transaction = charge.balance_transaction;
    return {
      feePence: transaction && typeof transaction !== "string" ? transaction.fee : null,
      method: paymentMethodLabel(charge.payment_method_details),
    };
  } catch {
    return { feePence: null, method: null };
  }
}

/** Public address of the shop, used for the links Stripe and partners send people back to. */
export function siteOrigin(request: Request) {
  // `||`, not `??`: an empty NEXT_PUBLIC_SITE_URL= line in the env file must fall back too.
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

/** The same public address, for server components that have no Request object. */
export async function pageOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const all = await headers();
  const host = all.get("x-forwarded-host") ?? all.get("host") ?? "localhost:3300";
  const protocol = all.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

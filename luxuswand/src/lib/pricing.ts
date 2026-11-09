// Price maths. Used by the pages and by the checkout route, so the basket the
// customer sees and the amount charged always come from the same code.

import { site, type DeliveryOption, type VolumeDiscount } from "@/config/site";
import { getProduct, launchPricing, products, type Product } from "@/data/catalogue";

export const MAX_QTY = 200;

export type BasketLine = { slug: string; qty: number };

export type PricedLine = {
  product: Product;
  qty: number;
  unitPence: number;
  totalPence: number;
  /** Saved against the single-panel price thanks to the quantity break. */
  savedPence: number;
  tier: VolumeDiscount | null;
  /** The quantity discount in whole percent, rounded down so it is never overstated; null without one. */
  percentOff: number | null;
};

const currency = site.currency.toUpperCase();
const money = new Intl.NumberFormat(site.locale, { style: "currency", currency });
const wholeMoney = new Intl.NumberFormat(site.locale, { style: "currency", currency, maximumFractionDigits: 0 });

export function formatMoney(pence: number) {
  return money.format(pence / 100);
}

/** For thresholds in running text: "100 €" rather than "100,00 €" when there are no cents. */
export function formatRoundMoney(pence: number) {
  return pence % 100 === 0 ? wholeMoney.format(pence / 100) : formatMoney(pence);
}

/**
 * True once the launch period is over while the catalogue still holds the introductory
 * prices (see `launchPricing`): the checkout then takes no orders until the prices are updated.
 */
export function launchPricesOutdated(at: number) {
  return launchPricing !== null && at >= Date.parse(launchPricing.endsAt);
}

export function volumeTier(qty: number): VolumeDiscount | null {
  let best: VolumeDiscount | null = null;
  for (const tier of site.volumeDiscounts) {
    if (qty >= tier.minQty && (!best || tier.minQty > best.minQty)) best = tier;
  }
  return best;
}

/** The quantity break that applies to this product, or null when none makes it cheaper. */
function productTier(product: Product, qty: number): VolumeDiscount | null {
  const tier = volumeTier(qty);
  return tier && tier.unitPence < product.pricePence ? tier : null;
}

export function unitPricePence(product: Product, qty: number) {
  return productTier(product, qty)?.unitPence ?? product.pricePence;
}

/** Whole percent below the single-panel price, rounded down so it is never overstated. */
export function volumePercentOff(product: Product, unitPence: number): number | null {
  const off = Math.floor((1 - unitPence / product.pricePence) * 100);
  return off > 0 ? off : null;
}

/** Largest quantity discount in the catalogue, for "Bis zu X % sparen". Null without any. */
export function maxVolumePercentOff(): number | null {
  const all = products
    .flatMap((product) => site.volumeDiscounts.map((tier) => volumePercentOff(product, unitPricePence(product, tier.minQty))))
    .filter((value): value is number => value !== null);
  return all.length ? Math.max(...all) : null;
}

export function priceLine(product: Product, qty: number): PricedLine {
  const tier = productTier(product, qty);
  const unitPence = tier?.unitPence ?? product.pricePence;
  return {
    product,
    qty,
    unitPence,
    totalPence: unitPence * qty,
    savedPence: (product.pricePence - unitPence) * qty,
    tier,
    percentOff: tier ? volumePercentOff(product, unitPence) : null,
  };
}

/** Whole-number discount against the previous price, or null when there is none. */
export function percentOff(product: Product): number | null {
  if (!product.compareAtPence || product.compareAtPence <= product.pricePence) return null;
  return Math.round((1 - product.pricePence / product.compareAtPence) * 100);
}

export const onSale = (product: Product) => percentOff(product) !== null;

/** Largest discount in the catalogue, for "up to X% off". Null when nothing is on sale. */
export function maxPercentOff(): number | null {
  const all = products.map(percentOff).filter((value): value is number => value !== null);
  return all.length ? Math.max(...all) : null;
}

export function isValidQty(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY;
}

/** Drops lines that point at unknown products or carry an impossible quantity. */
export function cleanLines(input: unknown): BasketLine[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const { slug, qty } = entry as Record<string, unknown>;
    if (typeof slug !== "string" || !getProduct(slug) || !isValidQty(qty)) continue;
    merged.set(slug, Math.min(MAX_QTY, (merged.get(slug) ?? 0) + qty));
  }
  return [...merged].map(([slug, qty]) => ({ slug, qty }));
}

export function priceBasket(lines: BasketLine[]) {
  const priced = lines.flatMap((line) => {
    const product = getProduct(line.slug);
    return product ? [priceLine(product, line.qty)] : [];
  });
  return {
    lines: priced,
    count: priced.reduce((sum, line) => sum + line.qty, 0),
    subtotalPence: priced.reduce((sum, line) => sum + line.totalPence, 0),
    savedPence: priced.reduce((sum, line) => sum + line.savedPence, 0),
  };
}

export function qualifiesForFreeDelivery(subtotalPence: number) {
  const { freeOverPence } = site.delivery;
  return freeOverPence !== null && subtotalPence >= freeOverPence;
}

export function deliveryOptionsFor(subtotalPence: number): DeliveryOption[] {
  const { options } = site.delivery;
  if (!qualifiesForFreeDelivery(subtotalPence) || options.length === 0) return options;
  const [cheapest, ...rest] = [...options].sort((a, b) => a.pricePence - b.pricePence);
  return [{ ...cheapest, pricePence: 0 }, ...rest];
}

export function cheapestDeliveryPence(): number | null {
  const { options } = site.delivery;
  return options.length ? Math.min(...options.map((option) => option.pricePence)) : null;
}

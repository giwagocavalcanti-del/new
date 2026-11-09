import { site } from "@/config/site";

// The catalogue. While `site.sampleMode` is true these are example products:
// replace finishes, formats, prices and photos with the supplier's real range.

export type FinishId =
  | "natural-oak"
  | "washed-oak"
  | "honey-oak"
  | "walnut"
  | "smoked-oak"
  | "black-oak";

export type Finish = {
  id: FinishId;
  name: string;
  /**
   * Slat colour, measured from the finish's photo by scripts/images/build-photos.mjs
   * (the swatch chips use a square of the photo itself). Used for the illustrations,
   * the 3D view and as the fallback swatch.
   */
  slat: string;
  felt: string;
  feltName: string;
  /** The backing in the dative, for running text: "auf schwarzem Filz". */
  feltOn: string;
};

export type FormatId = "classic";

export type Format = {
  id: FormatId;
  name: string;
  heightMm: number;
  widthMm: number;
  depthMm: number;
  blurb: string;
};

export type Tag = "best-seller" | "new";

export type Product = {
  slug: string;
  name: string;
  finish: Finish;
  format: Format;
  pricePence: number;
  /** Previous selling price. Only set when the product really sold at that price. */
  compareAtPence: number | null;
  /** Price after the launch period (`launchPricing`), when `pricePence` is an introductory price. */
  laterPricePence: number | null;
  tags: Tag[];
  /** Paths under /public. Empty = show the generated illustration instead. */
  photos: string[];
};

export const finishes: Record<FinishId, Finish> = {
  "natural-oak": { id: "natural-oak", name: "Eiche Natur", slat: "#be9c7a", felt: "#1b1a19", feltName: "Schwarzer Filz", feltOn: "schwarzem Filz" },
  "washed-oak": { id: "washed-oak", name: "Eiche Gekalkt", slat: "#bea998", felt: "#8f8a83", feltName: "Grauer Filz", feltOn: "grauem Filz" },
  "honey-oak": { id: "honey-oak", name: "Eiche Honig", slat: "#ce8840", felt: "#1b1a19", feltName: "Schwarzer Filz", feltOn: "schwarzem Filz" },
  walnut: { id: "walnut", name: "Nussbaum", slat: "#6a4530", felt: "#1b1a19", feltName: "Schwarzer Filz", feltOn: "schwarzem Filz" },
  "smoked-oak": { id: "smoked-oak", name: "Räuchereiche", slat: "#6c4e38", felt: "#1b1a19", feltName: "Schwarzer Filz", feltOn: "schwarzem Filz" },
  "black-oak": { id: "black-oak", name: "Eiche Schwarz", slat: "#383636", felt: "#141312", feltName: "Schwarzer Filz", feltOn: "schwarzem Filz" },
};

export const formats: Record<FormatId, Format> = {
  classic: {
    id: "classic",
    name: "Premium",
    heightMm: 2700,
    widthMm: 600,
    depthMm: 21,
    blurb: "Volle Höhe für normale Raumhöhen.",
  },
};

/** Construction details shared by the whole range. `null` shows as "—". */
export const construction: {
  slatWidthMm: number | null;
  gapMm: number | null;
  /** Thickness of the felt backing; the slats sit on it, so slat height = depth − felt. */
  feltMm: number | null;
  /** How the panels are fixed to the wall, as the supplier confirms it. `null` = not confirmed: the site names no method. */
  mounting: ("adhesive" | "screws")[] | null;
  weightKg: Record<FormatId, number | null>;
} = {
  slatWidthMm: 27,
  gapMm: 13,
  feltMm: 9,
  mounting: null,
  weightKg: { classic: null },
};

/**
 * Introductory prices: the lineup prices hold until `endsAt`, then each format costs
 * `laterPricePence`, and every product page says so. On that date, change the lineup to
 * the later prices and set this to null, then publish; until then the checkout refuses
 * new orders, so nobody is charged the old price after the shop announced the new one.
 * Since 07/11/2026: "Black November", 8,99 € until 30/11/2026, then the regular 29,99 €
 * (the owner's Black November price, about 70 % below 29,99 €, shown as a time-limited price, never as a struck-through one:
 * the shop has not sold at 29,99 € yet). `null` = no launch period.
 */
type LaunchPricing = {
  /** Name of the offer on the product page (card and price note). The prices stay the real ones. */
  label: string;
  endsAt: string;
  laterPricePence: Record<FormatId, number>;
};

export const launchPricing: LaunchPricing | null = {
  label: "Black November",
  endsAt: "2026-11-30T23:59:59+01:00",
  laterPricePence: { classic: 2999 },
};

type Row = [FormatId, FinishId, pricePence: number, compareAtPence: number | null, tags: Tag[]];

const lineup: Row[] = [
  ["classic", "natural-oak", 899, null, ["best-seller"]],
  ["classic", "walnut", 899, null, ["best-seller"]],
  ["classic", "black-oak", 899, null, ["best-seller"]],
  ["classic", "honey-oak", 899, null, ["new"]],
  ["classic", "washed-oak", 899, null, ["new"]],
  ["classic", "smoked-oak", 899, null, []],
];

function productName(finish: Finish) {
  return `Lamellen-Wandpaneel ${finish.name}`;
}

const GERMAN_LETTERS: Record<string, string> = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };

function slugify(text: string) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN_LETTERS[letter])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const products: Product[] = lineup.map(([formatId, finishId, pricePence, compareAtPence, tags]) => {
  const finish = finishes[finishId];
  const format = formats[formatId];
  const name = productName(finish);
  const slug = slugify(name);
  const later = launchPricing?.laterPricePence[formatId] ?? null;
  const laterPricePence = later !== null && later > pricePence ? later : null;
  return { slug, name, finish, format, pricePence, compareAtPence, laterPricePence, tags, photos: [`/products/${slug}.jpg`] };
});

const bySlug = new Map(products.map((product) => [product.slug, product]));

export function getProduct(slug: string): Product | undefined {
  return bySlug.get(slug);
}

/** The same format in every other finish, for the finish picker. */
export function siblings(product: Product): Product[] {
  return products.filter((other) => other.format.id === product.format.id);
}

/** A length for the customer, in centimetres: 2700 mm → "270 cm", 21 mm → "2,1 cm". */
export function centimetres(mm: number) {
  return `${(mm / 10).toLocaleString(site.locale, { maximumFractionDigits: 1 })} cm`;
}

/** Height × width for the customer: "270 × 60 cm". */
export function panelSize(format: Format) {
  const cm = (mm: number) => (mm / 10).toLocaleString(site.locale, { maximumFractionDigits: 1 });
  return `${cm(format.heightMm)} × ${cm(format.widthMm)} cm`;
}

export function dimensions(format: Format) {
  const cm = (mm: number) => (mm / 10).toLocaleString(site.locale, { maximumFractionDigits: 1 });
  return `${cm(format.heightMm)} × ${cm(format.widthMm)} × ${cm(format.depthMm)} cm`;
}

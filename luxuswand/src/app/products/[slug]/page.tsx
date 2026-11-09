import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyBox } from "@/components/BuyBox";
import { Faq } from "@/components/Faq";
import { Gallery } from "@/components/Gallery";
import { ProductCard } from "@/components/ProductCard";
import { Reviews } from "@/components/Reviews";
import { PromoCountdown, ShowUntil } from "@/components/PromoCountdown";
import { swatchStyle } from "@/components/SlatArt";
import { LockIcon, ReturnIcon, TruckIcon } from "@/components/icons";
import { site } from "@/config/site";
import { deliverySummary, faqItems, returnsSummary } from "@/content/policies";
import { construction, dimensions, getProduct, centimetres, launchPricing, panelSize, products, siblings, type Product } from "@/data/catalogue";
import { formatMoney, percentOff } from "@/lib/pricing";
import { shopDate, shopDateTime, shopDayAfter } from "@/lib/shop-time";

// Every valid address is prerendered at build time, so nothing here waits on
// data. This tells Next.js not to ask for a loading placeholder on these pages.
export const instant = false;

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

function describe(product: Product) {
  return `Holzlamellen in ${product.finish.name} auf ${product.finish.feltOn}, ${centimetres(product.format.heightMm)} hoch und ${centimetres(product.format.widthMm)} breit. ${product.format.blurb}`;
}

export async function generateMetadata(props: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = getProduct(slug);
  if (!product) return {};
  return { title: product.name, description: describe(product) };
}

const dash = (value: number | null, unit: string) => (value === null ? "—" : `${value} ${unit}`);

export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const product = getProduct(slug);
  if (!product) notFound();

  const off = percentOff(product);
  const launch = launchPricing && product.laterPricePence !== null ? { ...launchPricing, laterPence: product.laterPricePence } : null;
  const otherFinishes = siblings(product);
  const otherFormats = products.filter((other) => other.finish.id === product.finish.id);
  const related = products
    .filter((other) => other.slug !== product.slug && other.finish.id === product.finish.id)
    .concat(products.filter((other) => other.finish.id !== product.finish.id && other.format.id === product.format.id))
    .slice(0, 4);

  const specs: [string, string][] = [
    ["Ausführung", product.finish.name],
    ["Rückseite", product.finish.feltName],
    ["Format", product.format.name],
    ["Maße (H × B × T)", dimensions(product.format)],
    ["Lamellenbreite", dash(construction.slatWidthMm, "mm")],
    ["Abstand zwischen den Lamellen", dash(construction.gapMm, "mm")],
    ["Gewicht", dash(construction.weightKg[product.format.id], "kg")],
  ];

  const assurances = [
    { icon: <TruckIcon />, title: "Versand", text: deliverySummary() },
    { icon: <ReturnIcon />, title: "Widerruf", text: returnsSummary() },
    {
      icon: <LockIcon />,
      title: "Sichere Zahlung",
      text: "Kartenzahlungen laufen über eine Bezahlseite von Stripe.",
    },
  ];

  return (
    <div className="shell py-8 md:py-12">
      <nav aria-label="Navigationspfad" className="text-muted text-xs">
        <Link href="/" className="hover:text-ink">
          Startseite
        </Link>
        <span className="mx-2">/</span>
        <Link href="/shop" className="hover:text-ink">
          Wandpaneele
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Gallery key={product.slug} product={product} />

        <div>
          <p className="eyebrow">
            {product.format.name} · {panelSize(product.format)}
          </p>
          <h1 className="display mt-2 text-4xl md:text-5xl">{product.name}</h1>

          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold">{formatMoney(product.pricePence)}</span>
            {off !== null && product.compareAtPence && (
              <>
                <s className="text-muted">
                  <span className="sr-only">Vorher </span>
                  {formatMoney(product.compareAtPence)}
                </s>
                <span className="text-sale text-sm font-semibold">{off} % sparen</span>
              </>
            )}
            <span className="text-muted text-sm">
              pro Paneel{site.pricesIncludeVat === true && ", inkl. MwSt."}
              {site.pricesIncludeVat === false && ", zzgl. MwSt."}
            </span>
          </p>
          {launch && (
            <ShowUntil endsAt={launch.endsAt}>
              <p className="text-brass-ink mt-1.5 text-sm font-medium">
                {launch.label}: Dieser Preis gilt bis {shopDate(launch.endsAt)}, danach {formatMoney(launch.laterPence)}.
              </p>
            </ShowUntil>
          )}

          <p className="text-muted mt-5 leading-relaxed">{describe(product)}</p>

          <div className="mt-7">
            <p className="text-sm">
              <span className="text-muted">Ausführung:</span> <span className="font-medium">{product.finish.name}</span>
            </p>
            <ul className="mt-3 flex flex-wrap gap-2.5">
              {otherFinishes.map((option) => {
                const current = option.slug === product.slug;
                return (
                  <li key={option.slug}>
                    <Link
                      href={`/products/${option.slug}`}
                      aria-current={current ? "page" : undefined}
                      title={option.finish.name}
                      className={`block size-12 rounded-lg border-2 p-0.5 transition-colors ${
                        current ? "border-bark" : "hover:border-line border-transparent"
                      }`}
                    >
                      <span className="block h-full w-full rounded-md" style={swatchStyle(option.finish)} />
                      <span className="sr-only">{option.finish.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {otherFormats.length > 1 && (
            <div className="mt-6">
              <p className="text-sm">
                <span className="text-muted">Format:</span> <span className="font-medium">{product.format.name}</span>
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherFormats.map((option) => {
                  const current = option.slug === product.slug;
                  return (
                    <li key={option.slug}>
                      <Link
                        href={`/products/${option.slug}`}
                        aria-current={current ? "page" : undefined}
                        className={`block rounded-full border px-4 py-2 text-sm transition-colors ${
                          current ? "border-ink bg-ink text-surface" : "border-line hover:border-bark"
                        }`}
                      >
                        {option.format.name} · {panelSize(option.format)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-7">
            <BuyBox key={product.slug} product={product} />
          </div>

          {/* Only with a real promotion: an end date in the config and a real discount on this product. */}
          {site.promo?.endsAt && off !== null && (
            <PromoCountdown
              label={site.promo.label}
              endsAt={site.promo.endsAt}
              heading={
                <>
                  <span className="text-[#ff8a4c]">{site.promo.label}:</span>{" "}
                  <span className="whitespace-nowrap">{off}&nbsp;% Rabatt</span>
                </>
              }
            >
              Das Angebot endet am {shopDateTime(site.promo.endsAt)}.
            </PromoCountdown>
          )}
          {launch && !(site.promo?.endsAt && off !== null) && (
            <PromoCountdown
              label={launch.label}
              endsAt={launch.endsAt}
              heading={
                <>
                  <span className="text-[#ff8a4c]">{launch.label}:</span>{" "}
                  <span className="whitespace-nowrap">{formatMoney(product.pricePence)}</span>
                </>
              }
            >
              Bis zum {shopDateTime(launch.endsAt)} kostet dieses Paneel {formatMoney(product.pricePence)}. Ab dem{" "}
              {shopDayAfter(launch.endsAt)} kostet es {formatMoney(launch.laterPence)}.
            </PromoCountdown>
          )}
        </div>
      </div>

      <ul className="border-line mt-12 grid gap-7 border-y py-8 md:mt-16 md:grid-cols-3 md:gap-8 lg:gap-12">
        {assurances.map((item) => (
          <li key={item.title} className="flex gap-4 md:flex-col md:gap-3 lg:flex-row lg:gap-4">
            <span className="text-bark mt-0.5 shrink-0">{item.icon}</span>
            <div>
              <h2 className="text-sm font-semibold">{item.title}</h2>
              <p className="text-muted mt-1 text-sm leading-relaxed">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <Reviews />

      <section className="mt-20 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="display text-3xl">Technische Daten</h2>
          <dl className="divide-line border-line mt-6 divide-y border-y text-sm">
            {specs.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-6 py-3.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="display text-3xl">Fragen</h2>
          <div className="mt-6">
            <Faq items={faqItems()} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="display text-center text-3xl md:text-4xl">Das könnte dir auch gefallen</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {related.map((other) => (
              <ProductCard key={other.slug} product={other} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

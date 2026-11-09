import Link from "next/link";
import { BeforeAfter } from "@/components/BeforeAfter";
import { CollectionGrid } from "@/components/CollectionGrid";
import { Faq } from "@/components/Faq";
import { FinishSwitcher } from "@/components/motion/FinishSwitcher";
import { HeroLight } from "@/components/motion/HeroLight";
import { HeroScene } from "@/components/motion/HeroScene";
import { MountingSteps } from "@/components/motion/MountingSteps";
import { ProductRail } from "@/components/ProductRail";
import { SlatArt } from "@/components/SlatArt";
import { ArrowIcon, CheckIcon, ReturnIcon, RulerIcon, StackIcon, SwatchIcon, TruckIcon } from "@/components/icons";
import { site } from "@/config/site";
import { faqItems, freeDeliverySentence, mountingSteps } from "@/content/policies";
import { finishes, centimetres, panelSize, products } from "@/data/catalogue";
import { cheapestDeliveryPence, formatMoney, maxPercentOff, maxVolumePercentOff } from "@/lib/pricing";

const finishCount = new Set(products.map((product) => product.finish.id)).size;
const heights = [...new Set(products.map((product) => product.format.heightMm))].sort((a, b) => a - b);
const widths = [...new Set(products.map((product) => product.format.widthMm))];
const finishNames = [...new Set(products.map((product) => product.finish.name))];
const formatNames = [...new Set(products.map((product) => product.format.name))];
const shopFormats = [...new Map(products.map((product) => [product.format.id, product.format])).values()];
const onlyFormat = shopFormats.length === 1 ? shopFormats[0] : null;
const list = new Intl.ListFormat(site.locale, { style: "long", type: "conjunction" });

function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="display mt-2 text-4xl md:text-5xl">{title}</h2>
      {children && <p className="text-muted mt-4 leading-relaxed">{children}</p>}
    </div>
  );
}

function Hero() {
  // Without a real discount in the catalogue there is no sale to announce.
  const biggestOff = site.promo ? maxPercentOff() : null;
  const maxOff = biggestOff !== null && biggestOff > 0 ? biggestOff : null;
  const endsAt = site.promo?.endsAt
    ? new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "long" }).format(new Date(site.promo.endsAt))
    : null;

  return (
    <section className="bg-bark-deep text-paper relative isolate overflow-hidden">
      <HeroScene />
      <HeroLight />

      <div className="shell flex min-h-[34rem] flex-col items-center justify-center py-20 text-center md:min-h-[72vh] md:py-28">
        <p className="hero-float text-paper/90 text-[11px] font-medium tracking-[0.3em] uppercase [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]">
          {site.strapline}
        </p>
        <h1
          aria-label={site.name}
          className="display mt-4 text-6xl [text-shadow:0_2px_26px_rgb(0_0_0/0.5)] sm:text-7xl md:text-[5.5rem]"
        >
          {[...site.name].map((letter, index, letters) => (
            <span
              key={index}
              aria-hidden="true"
              className="hero-letter"
              // Each letter is its own span, so the font cannot kern pairs like "Wa": pull those in by hand.
              style={{ animationDelay: `${index * -0.42}s`, marginLeft: /[TVWY]/.test(letters[index - 1] ?? "") && /[aeo]/.test(letter) ? "-0.07em" : undefined }}
            >
              {letter}
            </span>
          ))}
        </h1>
        <ul className="hero-float text-paper/95 mt-6 flex flex-col items-center gap-x-4 gap-y-1.5 sm:flex-row sm:flex-wrap sm:justify-center text-xs font-medium tracking-[0.22em] uppercase [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]">
          <li>{finishCount} Ausführungen</li>
          <li aria-hidden="true" className="hidden sm:block">|</li>
          <li>{onlyFormat ? panelSize(onlyFormat) : `${heights.length} Höhen`}</li>
          <li aria-hidden="true" className="hidden sm:block">|</li>
          <li>Zuschneidbar</li>
        </ul>

        <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row">
          {site.promo && maxOff !== null && (
            <div className="border-paper/15 bg-bark-deep/70 flex items-center gap-5 rounded-2xl border px-6 py-4 backdrop-blur-sm">
              <p className="flex items-baseline gap-2">
                <span className="text-[10px] tracking-[0.2em] uppercase">Bis zu</span>
                <span className="display text-brass text-5xl">{maxOff} %</span>
                <span className="display text-2xl">Rabatt</span>
              </p>
              <span className="bg-paper/20 h-10 w-px" aria-hidden="true" />
              <p className="text-left text-[11px] leading-relaxed tracking-[0.14em] uppercase">
                {site.promo.label}
                <span className="text-paper/70 block">{endsAt ? `Bis ${endsAt}` : "Auf ausgewählte Paneele"}</span>
              </p>
            </div>
          )}
          <Link href="/shop" className="btn btn-brass">
            {site.promo && maxOff !== null ? "Zu den Angeboten" : "Kollektion ansehen"}
            <ArrowIcon width={16} height={16} />
          </Link>
        </div>
      </div>
      <p className="text-paper/70 absolute right-4 bottom-3 text-[10px]">Symbolbild</p>
    </section>
  );
}

function Highlights() {
  const bestVolumeOff = maxVolumePercentOff();
  const deliveryFrom = cheapestDeliveryPence();

  const items = [
    {
      icon: <SwatchIcon />,
      title: `${finishCount} Holzausführungen`,
      text: `${list.format(finishNames)}.`,
    },
    {
      icon: <RulerIcon />,
      title: onlyFormat ? `Format ${onlyFormat.name}` : `${heights.length} Paneelhöhen`,
      text: onlyFormat
        ? `${panelSize(onlyFormat)}. Lässt sich passend zuschneiden.`
        : `${list.format(heights.map(centimetres))}. Jede lässt sich passend zuschneiden.`,
    },
    bestVolumeOff !== null && {
      icon: <StackIcon />,
      title: `Bis zu ${bestVolumeOff} % sparen`,
      text: `Mengenpreise gibt es ab ${Math.min(...site.volumeDiscounts.map((tier) => tier.minQty))} Paneelen derselben Ausführung.`,
    },
    deliveryFrom !== null && {
      icon: <TruckIcon />,
      title: "Lieferung in Deutschland",
      text: `Ab ${formatMoney(deliveryFrom)}. ${freeDeliverySentence() ?? ""}`.trim(),
    },
    {
      icon: <ReturnIcon />,
      title: `${site.returnsDays} Tage Widerrufsrecht`,
      text: "Du hast es dir anders überlegt? Schick die Paneele innerhalb der Frist zurück.",
    },
  ].filter((item) => !!item);

  return (
    <section className="shell mt-20">
      <ul className="border-line grid gap-8 border-y py-10 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <li key={item.title} className="text-center">
            <span className="bg-sand text-bark mx-auto grid size-12 place-items-center rounded-full">{item.icon}</span>
            <h3 className="font-display mt-4 text-xl font-semibold">{item.title}</h3>
            <p className="text-muted mt-1.5 text-sm leading-relaxed">{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feature() {
  const points = [
    "Hinter Fernseher oder Bett, im Flur oder rundum im ganzen Raum",
    onlyFormat
      ? `Ein Format für die ganze Wand: ${panelSize(onlyFormat)}, passend zuschneidbar`
      : `Die passende Höhe für deine Wand: ${list.format(formatNames)}`,
    "Kartenzahlung über die sichere Bezahlseite von Stripe",
    `${site.returnsDays} Tage, um es dir anders zu überlegen`,
  ];

  return (
    <section className="shell mt-24 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="bg-sand aspect-[5/4] overflow-hidden rounded-2xl">
        <SlatArt
          finish={finishes["natural-oak"]}
          variant="detail"
          label={`Illustration in Nahaufnahme: Lamellen in ${finishes["natural-oak"].name} auf ${finishes["natural-oak"].feltOn}`}
          className="h-full w-full"
        />
      </div>
      <div>
        <p className="eyebrow">Warum Lamellenpaneele</p>
        <h2 className="display mt-2 text-4xl md:text-5xl">Eine Wand kann den ganzen Raum verändern</h2>
        <p className="text-muted mt-5 leading-relaxed">
          Senkrechte Holzlamellen bringen Tiefe, Wärme und einen klaren Rhythmus an eine schlicht gestrichene Wand. Jedes
          Paneel kommt in einem Stück, die Lamellen sind bereits auf einem Filzrücken befestigt und fertig zur Montage.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckIcon className="text-brass-ink mt-0.5 shrink-0" width={18} height={18} />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/shop" className="btn btn-dark">
            Jetzt ansehen
          </Link>
          <Link href="/info/faq" className="btn btn-outline">
            Mehr erfahren
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const steps = mountingSteps();

  return (
    <>
      <Hero />

      <section className="shell mt-16 md:mt-20">
        <SectionHeading title="Unsere Wandpaneele">
          Ausführung wählen, Höhe wählen.
          {widths.length === 1 &&
            ` Jedes Paneel ist ${centimetres(widths[0])} breit, so weißt du in einer Minute, wie viele du brauchst.`}
        </SectionHeading>
        <div className="mt-10">
          <ProductRail products={products} />
        </div>
      </section>

      <Highlights />
      <Feature />

      <section className="shell mt-24">
        <FinishSwitcher />
      </section>

      <section className="shell mt-24">
        <SectionHeading eyebrow="Montage" title={`In ${steps.length} Schritten zur neuen Wand`}>
          Vom Messen bis zur fertigen Wand.
        </SectionHeading>
        <div className="mx-auto mt-10 max-w-6xl">
          <MountingSteps steps={steps} finish={finishes.walnut} />
        </div>
      </section>

      <section className="shell mt-24">
        <SectionHeading eyebrow="Die Verwandlung" title="Sieh den Unterschied">
          Dieselbe Wand, einmal schlicht und einmal mit Paneelen.
        </SectionHeading>
        <div className="mx-auto mt-10 max-w-5xl">
          <BeforeAfter finish={finishes["natural-oak"]} />
        </div>
        <div className="mt-8 text-center">
          <Link href="/shop" className="btn btn-brass">
            Deine Wand gestalten
          </Link>
        </div>
      </section>

      <section id="collection" className="shell mt-24 scroll-mt-24">
        <SectionHeading eyebrow={`${site.name} Kollektion`} title="Zur Kollektion" />
        <div className="mt-10">
          <CollectionGrid products={products} />
        </div>
      </section>

      <section className="shell mt-24">
        <SectionHeading title="Häufige Fragen">
          Was du vor der Bestellung wissen solltest.
        </SectionHeading>
        <div className="mx-auto mt-10 max-w-3xl">
          <Faq items={faqItems()} />
        </div>
      </section>
    </>
  );
}

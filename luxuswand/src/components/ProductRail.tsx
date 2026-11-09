"use client";

import { useRef, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { ChevronIcon } from "@/components/icons";
import type { Product } from "@/data/catalogue";
import { onSale } from "@/lib/pricing";

const TABS: { id: string; label: string; match: (product: Product) => boolean }[] = [
  { id: "best", label: "Unsere Auswahl", match: (product) => product.tags.includes("best-seller") },
  { id: "new", label: "Neu", match: (product) => product.tags.includes("new") },
  { id: "sale", label: "Angebote", match: onSale },
];

export function ProductRail({ products }: { products: Product[] }) {
  // A tab only exists when the catalogue has something to put in it.
  const tabs = TABS.map((tab) => ({ ...tab, items: products.filter(tab.match) })).filter((tab) => tab.items.length > 0);
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const scroller = useRef<HTMLDivElement>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!active) return null;

  const scrollBy = (direction: 1 | -1) => {
    const element = scroller.current;
    element?.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  };

  const choose = (id: string) => {
    setActiveId(id);
    scroller.current?.scrollTo({ left: 0 });
  };

  return (
    <div>
      <div role="tablist" aria-label="Ausgewählte Paneele" className="border-line flex justify-center gap-8 border-b">
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`rail-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="rail-panel"
              onClick={() => choose(tab.id)}
              className={`font-display -mb-px cursor-pointer border-b-2 px-1 pb-3 text-2xl transition-colors ${
                selected ? "border-ink text-ink" : "text-muted hover:text-ink border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="relative mt-8">
        <div
          ref={scroller}
          id="rail-panel"
          role="tabpanel"
          aria-labelledby={`rail-tab-${active.id}`}
          className="no-scrollbar flex snap-x snap-mandatory justify-center-safe gap-5 overflow-x-auto scroll-smooth pb-2"
        >
          {active.items.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              className="w-[62%] shrink-0 snap-start sm:w-[38%] md:w-[28%] lg:w-[calc((100%-3.75rem)/4)]"
            />
          ))}
        </div>
        {(["prev", "next"] as const).map((side) => (
          <button
            key={side}
            onClick={() => scrollBy(side === "prev" ? -1 : 1)}
            aria-label={side === "prev" ? "Zurück blättern" : "Weiter blättern"}
            className={`bg-surface border-line hover:border-ink absolute top-[38%] hidden size-10 cursor-pointer place-items-center rounded-full border shadow-sm transition-colors md:grid ${
              side === "prev" ? "-left-3" : "-right-3"
            }`}
          >
            <ChevronIcon className={side === "prev" ? "rotate-180" : undefined} />
          </button>
        ))}
      </div>
    </div>
  );
}

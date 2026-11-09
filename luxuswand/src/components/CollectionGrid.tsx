"use client";

import { useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { formats, panelSize, type FormatId, type Product } from "@/data/catalogue";
import { onSale } from "@/lib/pricing";

type Filter = "all" | "sale" | FormatId;

export function CollectionGrid({ products }: { products: Product[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const shownFormats = Object.values(formats).filter((format) => products.some((product) => product.format.id === format.id));
  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "Alle Paneele" },
    // One chip per format, only when there is more than one to choose from.
    ...(shownFormats.length > 1
      ? shownFormats.map((format) => ({ id: format.id, label: `${format.name} · ${panelSize(format)}` }))
      : []),
    ...(products.some(onSale) ? [{ id: "sale" as const, label: "Angebote" }] : []),
  ];

  const visible = products.filter((product) => {
    if (filter === "all") return true;
    if (filter === "sale") return onSale(product);
    return product.format.id === filter;
  });

  return (
    <div>
      {/* With a single format and no offers only "Alle Paneele" would be left: no filter then. */}
      {chips.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Paneele filtern">
          {chips.map((chip) => (
            <button
              key={chip.id}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
              className={`cursor-pointer rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                filter === chip.id ? "border-bark bg-bark text-paper" : "border-line hover:border-ink bg-surface"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
      <p className="text-muted mt-5 text-center text-xs" aria-live="polite">
        {visible.length} {visible.length === 1 ? "Paneel" : "Paneele"}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}

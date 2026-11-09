"use client";

import { useState } from "react";
import { QuantityStepper } from "@/components/QuantityStepper";
import { BagIcon } from "@/components/icons";
import { site } from "@/config/site";
import { centimetres, type Product } from "@/data/catalogue";
import { basket, openBasket } from "@/lib/basket";
import { formatMoney, MAX_QTY, priceLine } from "@/lib/pricing";

function PanelCalculator({ product, onUse }: { product: Product; onUse: (qty: number) => void }) {
  const [width, setWidth] = useState("");
  const wallMm = Number.parseFloat(width.replace(",", ".")) * 1000;
  const needed = Number.isFinite(wallMm) && wallMm > 0 ? Math.ceil(wallMm / product.format.widthMm) : null;

  return (
    <details className="border-line bg-surface rounded-xl border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Wie viele Paneele brauche ich?</summary>
      <div className="space-y-3 px-4 pb-4 text-sm">
        <label className="block">
          <span className="text-muted">Breite deiner Wand in Metern</span>
          <input
            inputMode="decimal"
            placeholder="z. B. 3,2"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            className="border-line mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5"
          />
        </label>
        {needed !== null &&
          (needed > MAX_QTY ? (
            <p className="text-muted">Für diese Wand brauchst du mehr als {MAX_QTY} Paneele. Bitte kontaktiere uns für ein Angebot.</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p aria-live="polite">
                Du brauchst <strong>{needed}</strong> {needed === 1 ? "Paneel" : "Paneele"}, jeweils{" "}
                {centimetres(product.format.widthMm)} breit.
              </p>
              <button onClick={() => onUse(needed)} className="btn btn-outline shrink-0 px-4 py-2">
                {needed} übernehmen
              </button>
            </div>
          ))}
        <p className="text-muted text-xs">
          Für Wände bis {centimetres(product.format.heightMm)} Höhe. Plane ein zusätzliches Paneel ein, wenn du um Steckdosen oder
          Ecken herum schneiden musst.
        </p>
      </div>
    </details>
  );
}

export function BuyBox({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);
  const line = priceLine(product, qty);

  const add = () => {
    basket.add(product.slug, qty);
    openBasket();
  };

  return (
    <div className="space-y-5">
      {site.featuredQuantities.length > 0 && (
        <div>
          <p className="eyebrow">Mehr kaufen, mehr sparen</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2" role="group" aria-label="Menge auswählen">
            {site.featuredQuantities.map((count) => {
              const option = priceLine(product, count);
              const active = qty === count;
              return (
                <button
                  key={count}
                  onClick={() => setQty(count)}
                  aria-pressed={active}
                  className={`flex cursor-pointer flex-col items-start justify-start rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    active ? "border-bark bg-bark text-paper" : "border-line bg-surface hover:border-ink"
                  }`}
                >
                  <span className="block font-semibold">{count} Paneele</span>
                  <span className="mt-0.5 block text-base font-semibold">{formatMoney(option.totalPence)}</span>
                  <span className={`block text-xs ${active ? "text-paper/80" : "text-muted"}`}>
                    {formatMoney(option.unitPence)} pro Stück
                    {/* The single-panel price, struck through, only where the quantity price is really lower. */}
                    {option.unitPence < product.pricePence && (
                      <>
                        {" "}
                        <s className={active ? "text-paper/55" : "text-muted/70"}>
                          <span className="sr-only">statt </span>
                          {formatMoney(product.pricePence)}
                        </s>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PanelCalculator product={product} onUse={setQty} />

      <div className="flex items-center gap-4">
        <QuantityStepper value={qty} onChange={setQty} label="Menge" />
        <div className="text-sm">
          <p className="text-lg font-semibold">{formatMoney(line.totalPence)}</p>
          {line.savedPence > 0 && <p className="text-sale">Du sparst {formatMoney(line.savedPence)}</p>}
        </div>
      </div>

      <button onClick={add} className="btn btn-brass w-full py-4 text-xs">
        <BagIcon width={18} height={18} />
        In den Warenkorb
      </button>
    </div>
  );
}

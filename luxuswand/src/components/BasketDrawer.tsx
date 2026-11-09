"use client";

import Link from "next/link";
import { useRef } from "react";
import { QuantityStepper } from "@/components/QuantityStepper";
import { swatchStyle } from "@/components/SlatArt";
import { CloseIcon, LockIcon } from "@/components/icons";
import { site } from "@/config/site";
import { dimensions } from "@/data/catalogue";
import { basket, BASKET_DIALOG_ID, useBasket } from "@/lib/basket";
import { formatMoney, qualifiesForFreeDelivery } from "@/lib/pricing";

export function BasketDrawer() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { lines, count, subtotalPence, savedPence } = useBasket();
  const close = () => dialog.current?.close();
  const { freeOverPence } = site.delivery;
  const deliveryNote = qualifiesForFreeDelivery(subtotalPence)
    ? "Deine Bestellung wird kostenlos geliefert."
    : freeOverPence !== null
      ? `Noch ${formatMoney(freeOverPence - subtotalPence)} bis zum kostenlosen Versand.`
      : null;

  return (
    <dialog
      ref={dialog}
      id={BASKET_DIALOG_ID}
      aria-label="Warenkorb"
      className="sheet"
      onClick={(event) => event.target === event.currentTarget && close()}
    >
      <div className="flex h-full flex-col">
        <div className="border-line flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-display text-2xl font-semibold">
            Dein Warenkorb{count > 0 && <span className="text-muted text-base font-normal"> ({count})</span>}
          </h2>
          <button onClick={close} aria-label="Warenkorb schließen" className="-mr-2 grid size-10 cursor-pointer place-items-center">
            <CloseIcon />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <p className="text-muted">Dein Warenkorb ist leer.</p>
            <Link href="/shop" onClick={close} className="btn btn-dark">
              Paneele ansehen
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-line flex-1 divide-y overflow-y-auto px-6">
              {lines.map(({ product, qty, unitPence, totalPence, percentOff }) => (
                <li key={product.slug} className="flex gap-4 py-5">
                  <div className="size-20 shrink-0 rounded-lg" style={swatchStyle(product.finish)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <Link
                        href={`/products/${product.slug}`}
                        onClick={close}
                        className="font-display text-lg leading-tight font-semibold hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="font-semibold whitespace-nowrap">{formatMoney(totalPence)}</p>
                    </div>
                    <p className="text-muted mt-0.5 text-xs">{dimensions(product.format)}</p>
                    <p className="text-muted mt-0.5 text-xs">
                      {formatMoney(unitPence)} pro Stück
                      {percentOff !== null && <span className="text-sale"> · {percentOff} % Mengenrabatt</span>}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <QuantityStepper
                        value={qty}
                        onChange={(next) => basket.setQty(product.slug, next)}
                        label={`Menge von ${product.name}`}
                        compact
                      />
                      <button
                        onClick={() => basket.remove(product.slug)}
                        className="text-muted hover:text-ink cursor-pointer text-xs underline underline-offset-2"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-line space-y-3 border-t px-6 py-5">
              {savedPence > 0 && (
                <p className="text-sale flex justify-between text-sm">
                  <span>Mengenrabatt</span>
                  <span>−{formatMoney(savedPence)}</span>
                </p>
              )}
              <p className="flex justify-between text-lg font-semibold">
                <span>Zwischensumme</span>
                <span>{formatMoney(subtotalPence)}</span>
              </p>
              <p className="text-muted text-xs">
                {deliveryNote ? `${deliveryNote} ` : ""}Die Versandart wählst du an der Kasse, die Kosten kommen dort dazu.
              </p>
              <Link href="/checkout" onClick={close} className="btn btn-brass w-full">
                <LockIcon width={16} height={16} />
                Zur Kasse
              </Link>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

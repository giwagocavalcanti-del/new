"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ProductPhoto } from "@/components/ProductPhoto";
import { swatchStyle } from "@/components/SlatArt";
import { prefersReducedMotion, useVisibleFrame } from "@/components/motion/useVisibleFrame";
import { finishes, products, type FinishId } from "@/data/catalogue";

const SLATS = 18;
const DURATION = 950;
const ids = Object.keys(finishes) as FinishId[];
const SIZES = "(min-width: 768px) 55vw, 100vw";

function classicOf(id: FinishId) {
  return products.find((item) => item.format.id === "classic" && item.finish.id === id);
}

const smooth = (value: number) => value * value * (3 - 2 * value);
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Picking a finish turns the old colour away slat by slat to reveal the new one. */
export function FinishSwitcher() {
  const [current, setCurrent] = useState<FinishId>("walnut");
  const [previous, setPrevious] = useState<{ id: FinishId; key: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const turns = useRef(0);

  useVisibleFrame(stage, (time) => {
    if (!cover.current) return;
    if (!started.current) started.current = time;
    const elapsed = (time - started.current) / DURATION;
    const points: string[] = [];
    for (let index = 0; index < SLATS; index++) {
      const turned = smooth(clamp(elapsed * 1.7 - (index / SLATS) * 0.7));
      const left = (index / SLATS) * 100;
      const right = left + (100 / SLATS) * (1 - turned);
      points.push(`${left}% 100%`, `${left}% 0%`, `${right}% 0%`, `${right}% 100%`);
    }
    cover.current.style.clipPath = `polygon(${points.join(",")})`;
    if (elapsed >= 1) setPrevious(null);
  });

  function pick(id: FinishId) {
    if (id === current) return;
    started.current = 0;
    turns.current += 1;
    setPrevious(prefersReducedMotion() ? null : { id: current, key: turns.current });
    setCurrent(id);
  }

  const finish = finishes[current];
  const product = classicOf(current);
  const photo = product?.photos[0];
  const previousPhoto = previous ? classicOf(previous.id)?.photos[0] : undefined;

  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div ref={stage} className="bg-sand relative aspect-[4/5] overflow-hidden rounded-2xl">
        {photo && <ProductPhoto src={photo} alt={`Symbolbild: ${finish.name} an der Wand`} sizes={SIZES} />}
        {previousPhoto && previous && (
          <div ref={cover} key={previous.key} className="pointer-events-none absolute inset-0">
            <ProductPhoto src={previousPhoto} alt="" sizes={SIZES} />
          </div>
        )}
      </div>
      <div>
        <p className="eyebrow">Farbtöne</p>
        <h2 className="display mt-2 text-4xl md:text-5xl">Finde deinen Farbton</h2>
        <p className="text-muted mt-4 leading-relaxed">
          Wähle eine Oberfläche und sieh, wie sie an der Wand wirkt. Die Bilder sind Symbolbilder.
        </p>
        <div className="mt-6 flex flex-wrap gap-3" role="group" aria-label="Farbton wählen">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              aria-pressed={id === current}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                id === current ? "border-bark bg-sand" : "border-line hover:border-bark"
              }`}
            >
              <span className="size-5 rounded-full" style={swatchStyle(finishes[id])} aria-hidden="true" />
              {finishes[id].name}
            </button>
          ))}
        </div>
        {product && (
          <Link href={`/products/${product.slug}`} className="text-bark mt-6 inline-block text-sm font-semibold underline underline-offset-4">
            {finish.name} ansehen
          </Link>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Panel3D } from "@/components/Panel3D";
import { ProductPhoto } from "@/components/ProductPhoto";
import { SaleBadge } from "@/components/ProductCard";
import { SlatArt } from "@/components/SlatArt";
import { centimetres, construction, type Product } from "@/data/catalogue";
import { closeupPhotos } from "@/data/photo-variants";

/** Outline of the panel with its real proportions and measurements. */
function SizeDiagram({ product }: { product: Product }) {
  const { heightMm, widthMm } = product.format;
  const scale = 380 / 3000;
  const height = heightMm * scale;
  const width = widthMm * scale;
  const x = 200 - width / 2;
  const y = 450 - height;
  const patternId = `${useId().replace(/[^a-zA-Z0-9]/g, "")}slats`;
  const period = width / Math.round(widthMm / 40);

  return (
    <svg
      viewBox="0 0 400 500"
      className="h-full w-full"
      role="img"
      aria-label={`Maßzeichnung: ${centimetres(heightMm)} hoch und ${centimetres(widthMm)} breit`}
    >
      <rect width="400" height="500" fill="#ece6dd" />
      <line x1="40" y1="450" x2="360" y2="450" stroke="#6b6259" strokeWidth="1" />
      <defs>
        <pattern id={patternId} x={x} width={period} height="10" patternUnits="userSpaceOnUse">
          <rect width={period} height="10" fill={product.finish.felt} />
          <rect width={period * 0.675} height="10" fill={product.finish.slat} />
        </pattern>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${patternId})`} />
      <g stroke="#1d1b19" strokeWidth="1" fill="none">
        <path d={`M${x - 22} ${y}V450M${x - 27} ${y}h10M${x - 27} 450h10`} />
        <path d={`M${x} 470H${x + width}M${x} 465v10M${x + width} 465v10`} />
      </g>
      <g fill="#1d1b19" fontSize="13" fontFamily="inherit">
        <text x={x - 30} y={y + height / 2} textAnchor="end" dominantBaseline="middle">
          {centimetres(heightMm)}
        </text>
        <text x="200" y="492" textAnchor="middle">
          {centimetres(widthMm)}
        </text>
      </g>
    </svg>
  );
}

/** Photo of the panel's cross-section, the same for every product (centred on white, 1208 × 1500). */
const PROFILE_PHOTO = "/products/querschnitt.jpg";

const VIEW_KEY = "luxuswand-gallery-view";

/* Product photos are shown still, from the files built by scripts/images/build-photos.mjs.
   The main image is half of the 1280 px page on large screens (576 px), the full width on phones. */
const MAIN_SIZES = "(min-width: 1280px) 576px, (min-width: 1024px) 50vw, 100vw";

function rememberView(id: string) {
  try {
    if (id === "3d") sessionStorage.setItem(VIEW_KEY, "3d");
    else sessionStorage.removeItem(VIEW_KEY);
  } catch {}
}

export function Gallery({ product }: { product: Product }) {
  const views: { id: string; label: string; node: ReactNode; thumb: ReactNode }[] = product.photos.length
    ? product.photos.map((src, index) => ({
        id: src,
        label: `Foto ${index + 1}`,
        node: <ProductPhoto src={src} alt={`${product.name}, Foto ${index + 1}`} priority={index === 0} sizes={MAIN_SIZES} />,
        thumb: <ProductPhoto src={src} alt="" sizes="80px" />,
      }))
    : [
        {
          id: "wall",
          label: "An der Wand",
          node: <SlatArt finish={product.finish} label={`Illustration: ${product.name} an einer Wand`} className="h-full w-full" />,
          thumb: <SlatArt finish={product.finish} className="h-full w-full" />,
        },
        {
          id: "detail",
          label: "Nahaufnahme",
          node: <SlatArt finish={product.finish} variant="detail" label={`Illustration in Nahaufnahme: Lamellen in ${product.finish.name}`} className="h-full w-full" />,
          thumb: <SlatArt finish={product.finish} variant="detail" className="h-full w-full" />,
        },
      ];

  /* The close-up is a piece of the finish's room photo, so its colour and finish are exactly
     those of the first photo. Only a finish without one falls back to the drawing. */
  const closeup = closeupPhotos[product.finish.id];
  if (product.photos.length) {
    views.push({
      id: "detail",
      label: "Nahaufnahme",
      node: closeup ? (
        <ProductPhoto src={closeup} alt={`Nahaufnahme: Lamellen in ${product.finish.name}`} sizes={MAIN_SIZES} />
      ) : (
        <SlatArt finish={product.finish} variant="detail" label={`Illustration in Nahaufnahme: Lamellen in ${product.finish.name}`} className="h-full w-full" />
      ),
      thumb: closeup ? <ProductPhoto src={closeup} alt="" sizes="80px" /> : <SlatArt finish={product.finish} variant="detail" className="h-full w-full" />,
    });
  }

  views.push({
    id: "size",
    label: "Maße",
    node: <SizeDiagram product={product} />,
    thumb: <SizeDiagram product={product} />,
  });

  // The cross-section comes second to last, right before the 3D view.
  const { feltMm } = construction;
  const profileAlt = `Querschnitt des Paneels: ${centimetres(product.format.depthMm)} stark${feltMm ? `, davon ${centimetres(feltMm)} Filz` : ""}`;
  views.push({
    id: "profile",
    label: "Querschnitt",
    node: <ProductPhoto src={PROFILE_PHOTO} alt={profileAlt} sizes={MAIN_SIZES} />,
    thumb: <ProductPhoto src={PROFILE_PHOTO} alt="" sizes="80px" />,
  });

  // The 3D view comes last, after the photos and the drawings.
  views.push({
    id: "3d",
    label: "3D-Ansicht",
    node: <Panel3D product={product} />,
    thumb: (
      <span className="text-ink grid h-full w-full place-items-center content-center gap-0.5 text-[11px] font-semibold">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
        3D
      </span>
    ),
  });

  const [activeId, setActiveId] = useState(views[0].id);
  const active = views.find((view) => view.id === activeId) ?? views[0];

  /* Links ending in #3d (the QR code) open the 3D view. While someone is looking at it,
     switching finish or format keeps them in 3D on the next product page. */
  useEffect(() => {
    let keep = false;
    try {
      keep = sessionStorage.getItem(VIEW_KEY) === "3d";
    } catch {}
    const fromLink = window.location.hash === "#3d";
    if (!fromLink && !keep) return;
    const timer = setTimeout(() => {
      setActiveId("3d");
      rememberView("3d");
      if (fromLink) document.getElementById("produkt-galerie")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const choose = (id: string) => {
    setActiveId(id);
    rememberView(id);
  };

  /* Swipe sideways on the big image to go to the next or previous view. Not on the 3D view:
     there a sideways drag turns the model. Vertical drags still scroll the page (touch-action). */
  const index = views.indexOf(active);
  const swipeable = active.id !== "3d";
  const drag = useRef<{ pointer: number; x: number; y: number; sideways: boolean | null } | null>(null);
  const [offset, setOffset] = useState(0);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeable || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, sideways: null };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.sideways === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      current.sideways = Math.abs(dx) > Math.abs(dy);
      // Keeps the drag going if the finger leaves the image; the swipe also works without it.
      if (current.sideways) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      }
    }
    if (!current.sideways) return;
    // Past the first or last view the image only gives a little, to show there is nothing more.
    const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === views.length - 1);
    setOffset(atEnd ? dx / 4 : dx);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setOffset(0);
    if (!current.sideways || event.type === "pointercancel") return;
    const dx = event.clientX - current.x;
    if (Math.abs(dx) < Math.min(60, event.currentTarget.clientWidth * 0.15)) return;
    const next = views[index + (dx < 0 ? 1 : -1)];
    if (next) choose(next.id);
  };

  return (
    <div id="produkt-galerie" className="min-w-0 scroll-mt-24">
      <div
        className={`bg-sand relative aspect-[4/5] overflow-hidden rounded-2xl ${swipeable ? "cursor-grab touch-pan-y select-none active:cursor-grabbing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDragStart={(event) => event.preventDefault()}
      >
        {swipeable ? (
          <div
            className={`absolute inset-0 ${offset === 0 ? "transition-transform duration-200 ease-out" : ""}`}
            style={{ transform: `translateX(${offset}px)` }}
          >
            {active.node}
          </div>
        ) : (
          active.node
        )}
        <SaleBadge product={product} className="absolute top-4 left-4" />
      </div>
      <div className="mt-3 flex gap-3">
        {views.map((view) => (
          <button
            key={view.id}
            onClick={() => choose(view.id)}
            aria-label={`Anzeigen: ${view.label}`}
            aria-pressed={view.id === active.id}
            className={`bg-sand relative aspect-square w-20 min-w-0 shrink cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
              view.id === active.id ? "border-bark" : "hover:border-line border-transparent"
            }`}
          >
            {view.thumb}
          </button>
        ))}
      </div>
      <p className="text-muted mt-3 text-xs">
        {active.id === "3d"
          ? "3D-Modell nach den Katalogmaßen. Farbton und Maserung können abweichen."
          : active.id === "size"
          ? "Zeichnung nach den Katalogmaßen."
          : active.id === "detail" && closeup && product.photos.length
          ? "Ausschnitt aus dem Symbolbild. Farbton und Maserung können abweichen."
          : active.id === "profile"
          ? "Querschnitt: Lamellen auf Filz. Der Farbton hängt von der Ausführung ab."
          : product.photos.length
          ? "Symbolbild. Einrichtung nicht im Lieferumfang; Farbton und Maserung können abweichen."
          : "Das Bild ist eine Illustration, kein Foto."}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { SlatArt } from "@/components/SlatArt";
import type { MountingStep } from "@/content/policies";
import type { Finish } from "@/data/catalogue";

// Every position below is in the drawing's own units (1600 × 900, the "room" scene).
// The scene is always drawn at 16:9 and cropped by the frame, so these line up on any screen.
// On the 4:3 frame only x 200–1400 is visible: keep everything that matters inside that.
const W = 1600;
const H = 900;

/** Which part of the panelled wall is visible in each step: from x0 to x1, below y. */
const PANELS: Record<MountingStep["id"], { x0: number; x1: number; y: number }> = {
  prepare: { x0: 0, x1: 0, y: 0 },
  cut: { x0: 712, x1: 888, y: 0 },
  mount: { x0: 0, x1: 760, y: 0 },
  done: { x0: 0, x1: W, y: 0 },
};

const CUT_Y = 170;
const LEVEL = { x: 772, y: 300, width: 30, height: 320 };

const at = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

function clip({ x0, x1, y }: (typeof PANELS)[MountingStep["id"]]) {
  return `inset(${(y / H) * 100}% ${100 - (x1 / W) * 100}% 0% ${(x0 / W) * 100}%)`;
}

function Label({ x, y, shown, children }: { x: number; y: number; shown: boolean; children: string }) {
  return (
    <span
      style={at(x, y)}
      className={`bg-bark-deep/85 text-paper absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-opacity duration-500 sm:text-xs ${
        shown ? "opacity-100 delay-500" : "opacity-0"
      }`}
    >
      {children}
    </span>
  );
}

/** The four mounting steps: picking one shows it on the drawn wall. Moves on by itself until the visitor picks a step. */
export function MountingSteps({ steps, finish }: { steps: MountingStep[]; finish: Finish }) {
  const uid = useId();
  const section = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const step = steps[active];
  const show = (id: MountingStep["id"]) => step.id === id;

  return (
    <div ref={section} className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <figure>
        <div
          role="img"
          aria-label={`Illustration, Schritt ${active + 1} von ${steps.length}: ${step.title}`}
          className="bg-sand relative aspect-[4/3] overflow-hidden rounded-2xl"
        >
          <div className="absolute inset-y-0 left-1/2 aspect-video h-full -translate-x-1/2">
            <SlatArt finish={finish} variant="room" bare className="absolute inset-0 h-full w-full" />
            <div className="mount-clip absolute inset-0" style={{ clipPath: clip(PANELS[step.id]) }}>
              <SlatArt finish={finish} variant="room" className="h-full w-full" />
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
              <g className={`transition-opacity duration-500 ${show("prepare") ? "opacity-100 delay-500" : "opacity-0"}`}>
                <path d="M260 200 H1340 M260 170 V230 M1340 170 V230" stroke="#2a1d15" strokeWidth="4" fill="none" />
                <path d="M260 200 l26 -13 v26 z M1340 200 l-26 -13 v26 z" fill="#2a1d15" />
              </g>

              <g className={`transition-opacity duration-500 ${show("cut") ? "opacity-100 delay-500" : "opacity-0"}`}>
                <rect x="712" y="0" width="176" height={CUT_Y} fill="#f6f3ee" opacity="0.6" />
                <path d={`M680 ${CUT_Y} H920`} stroke="#8a3b2a" strokeWidth="5" strokeDasharray="18 12" />
              </g>

              <g className={`transition-opacity duration-500 ${show("mount") ? "opacity-100 delay-500" : "opacity-0"}`}>
                <rect x={LEVEL.x + 6} y={LEVEL.y + 8} width={LEVEL.width} height={LEVEL.height} rx="6" fill="#000" opacity="0.18" />
                <rect {...LEVEL} rx="6" fill="#e2b33c" stroke="#9c7a1f" strokeWidth="3" />
                {[0.18, 0.5, 0.82].map((position) => (
                  <g key={position}>
                    <rect x={LEVEL.x + 6} y={LEVEL.y + LEVEL.height * position - 22} width="18" height="44" rx="9" fill="#d7ecc4" />
                    <ellipse cx={LEVEL.x + 15} cy={LEVEL.y + LEVEL.height * position} rx="5" ry="9" fill="#fff" opacity="0.85" />
                  </g>
                ))}
              </g>
            </svg>

            <Label x={800} y={200} shown={show("prepare")}>
              Wandbreite messen
            </Label>
            <Label x={800} y={CUT_Y + 70} shown={show("cut")}>
              Auf Länge kürzen
            </Label>
            <Label x={LEVEL.x + 15} y={LEVEL.y + LEVEL.height + 60} shown={show("mount")}>
              Senkrecht ausrichten
            </Label>
          </div>

          <span className="bg-bark-deep/80 text-paper absolute top-4 right-4 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
            Schritt {active + 1} von {steps.length}
          </span>
        </div>
        <figcaption className="text-muted mt-3 text-center text-xs">Illustration in {finish.name}.</figcaption>
      </figure>

      <ol className="space-y-2">
        {steps.map((item, index) => {
          const current = index === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                aria-controls={`${uid}-text-${item.id}`}
                onClick={() => {
                  setActive(index);
                  setAuto(false);
                }}
                className={`relative block w-full overflow-hidden rounded-xl py-4 pr-5 pl-6 text-left transition-colors ${
                  current ? "bg-sand" : "hover:bg-sand/50"
                }`}
              >
                <span className={`absolute inset-y-0 left-0 w-0.5 ${current ? "bg-bark/25" : "bg-transparent"}`} aria-hidden="true" />
                {current && auto && (
                  <span
                    key={active}
                    aria-hidden="true"
                    className="mount-progress bg-bark absolute inset-y-0 left-0 w-0.5"
                    style={{ animationPlayState: visible ? "running" : "paused" }}
                    onAnimationEnd={() => setActive((index + 1) % steps.length)}
                  />
                )}
                {current && !auto && <span className="bg-bark absolute inset-y-0 left-0 w-0.5" aria-hidden="true" />}

                <span className="flex items-baseline gap-3">
                  <span className="text-brass-ink w-5 shrink-0 text-xs font-semibold tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-xl font-semibold">{item.title}</span>
                </span>
                <span
                  id={`${uid}-text-${item.id}`}
                  className={`grid transition-[grid-template-rows] duration-500 ${current ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <span className="overflow-hidden">
                    <span className="text-muted block pt-2 pl-8 text-sm leading-relaxed">{item.text}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

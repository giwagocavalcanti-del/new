"use client";

import { useRef, useState } from "react";
import { prefersReducedMotion, useVisibleFrame } from "@/components/motion/useVisibleFrame";
import { SlatArt } from "@/components/SlatArt";
import type { Finish } from "@/data/catalogue";

const smooth = (value: number) => value * value * (3 - 2 * value);

/** Draggable comparison of a plain wall and the same wall panelled. Both sides are drawings. */
export function BeforeAfter({ finish }: { finish: Finish }) {
  const [position, setPosition] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const intro = useRef({ start: 0, done: false });

  // Shows once how the slider works, until the visitor takes over.
  useVisibleFrame(stage, (time) => {
    if (intro.current.done) return;
    if (prefersReducedMotion()) {
      intro.current.done = true;
      return;
    }
    if (!intro.current.start) {
      // Waits until the slider is really in view, so the visitor sees it move.
      const box = stage.current?.getBoundingClientRect();
      if (!box || box.top > window.innerHeight * 0.65 || box.bottom < window.innerHeight * 0.35) return;
      intro.current.start = time;
    }
    const seconds = (time - intro.current.start) / 1000;
    if (seconds < 1.2) setPosition(50 + 34 * smooth(seconds / 1.2));
    else if (seconds < 2.9) setPosition(84 - 68 * smooth((seconds - 1.2) / 1.7));
    else if (seconds < 3.9) setPosition(16 + 34 * smooth((seconds - 2.9) / 1));
    else {
      intro.current.done = true;
      setPosition(50);
    }
  });

  return (
    <figure>
      <div ref={stage} className="bg-sand relative aspect-[4/3] overflow-hidden rounded-2xl select-none sm:aspect-[16/9]">
        <SlatArt finish={finish} variant="room" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <SlatArt finish={finish} variant="room" bare className="h-full w-full" />
        </div>

        <span className="bg-bark-deep/80 text-paper absolute top-4 left-4 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase">
          Vorher
        </span>
        <span className="bg-bark-deep/80 text-paper absolute top-4 right-4 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] uppercase">
          Nachher
        </span>

        <div className="bg-paper pointer-events-none absolute inset-y-0 w-0.5" style={{ left: `${position}%` }}>
          <span className="bg-paper text-bark absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full text-sm shadow-md">
            ↔
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(position)}
          onChange={(event) => {
            intro.current.done = true;
            setPosition(Number(event.target.value));
          }}
          aria-label="Wand vor und nach der Verkleidung vergleichen"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="text-muted mt-3 text-center text-xs">
        Illustration in {finish.name}. Zum Vergleichen ziehen.
      </figcaption>
    </figure>
  );
}

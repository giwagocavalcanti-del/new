"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

// Kept with the component (React hoists it into <head> once), so the effect ships wherever the card does.
const EMBER_CSS = `
.ember-glow {
  background:
    radial-gradient(42% 70% at 18% 100%, rgb(255 84 24 / 0.85), transparent 72%),
    radial-gradient(38% 65% at 52% 100%, rgb(214 36 26 / 0.8), transparent 72%),
    radial-gradient(40% 70% at 86% 100%, rgb(255 138 40 / 0.7), transparent 72%);
  animation: ember-drift 9s ease-in-out infinite alternate, ember-flicker 3.2s ease-in-out infinite;
}
.ember-spark {
  opacity: 0;
  animation: ember-rise var(--t) ease-out var(--d) infinite;
}
.ember-tick {
  animation: ember-tick 0.25s ease-out;
}
.ember-card {
  box-shadow: 0 0 0 1px rgb(255 90 31 / 0.15), 0 16px 40px -16px rgb(240 70 20 / 0.55);
  animation: ember-pulse 3.6s ease-in-out infinite;
}
@keyframes ember-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgb(255 90 31 / 0.15), 0 16px 40px -16px rgb(240 70 20 / 0.5); }
  50% { box-shadow: 0 0 0 1px rgb(255 90 31 / 0.35), 0 18px 48px -14px rgb(240 70 20 / 0.8); }
}
@keyframes ember-drift {
  0% { transform: translate3d(-4%, 4%, 0) scale(1); }
  50% { transform: translate3d(2%, -3%, 0) scale(1.08); }
  100% { transform: translate3d(5%, 2%, 0) scale(1.02); }
}
@keyframes ember-flicker {
  0%, 100% { opacity: 0.8; }
  30% { opacity: 1; }
  55% { opacity: 0.68; }
  78% { opacity: 0.92; }
}
@keyframes ember-rise {
  0% { transform: translate3d(0, 0, 0) scale(1); opacity: 0; }
  15% { opacity: 0.9; }
  100% { transform: translate3d(var(--dx), -150px, 0) scale(0.3); opacity: 0; }
}
@keyframes ember-tick {
  from { transform: translateY(-6%); opacity: 0.75; }
  to { transform: none; opacity: 1; }
}
.ember-flame {
  filter: drop-shadow(0 0 6px rgb(255 110 30 / 0.85)) drop-shadow(0 0 14px rgb(230 50 20 / 0.45));
  animation: ember-flame-glow 1.8s ease-in-out infinite;
}
.ember-flame path, .ember-flame circle {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}
.ember-flame .f-outer { animation: ember-lick-a 1.25s ease-in-out infinite; }
.ember-flame .f-mid { animation: ember-lick-b 0.95s ease-in-out infinite; }
.ember-flame .f-core { animation: ember-lick-c 0.7s ease-in-out infinite; }
.ember-flame .f-spark { opacity: 0; animation: ember-flame-spark 1.9s ease-out infinite; }
.ember-flame .f-spark-2 { animation-delay: 0.95s; }
@keyframes ember-lick-a {
  0%, 100% { transform: scale(1, 1) skewX(0deg); }
  20% { transform: scale(0.95, 1.08) skewX(-4deg); }
  45% { transform: scale(1.04, 0.94) skewX(3deg); }
  70% { transform: scale(0.97, 1.06) skewX(-2deg); }
}
@keyframes ember-lick-b {
  0%, 100% { transform: scale(1, 1) skewX(0deg); }
  30% { transform: scale(1.05, 0.92) skewX(5deg); }
  60% { transform: scale(0.94, 1.1) skewX(-4deg); }
}
@keyframes ember-lick-c {
  0%, 100% { transform: scale(1, 1); opacity: 1; }
  50% { transform: scale(0.88, 1.14); opacity: 0.85; }
}
@keyframes ember-flame-glow {
  0%, 100% { filter: drop-shadow(0 0 6px rgb(255 110 30 / 0.85)) drop-shadow(0 0 14px rgb(230 50 20 / 0.45)); }
  50% { filter: drop-shadow(0 0 9px rgb(255 130 40 / 0.95)) drop-shadow(0 0 20px rgb(230 50 20 / 0.6)); }
}
@keyframes ember-flame-spark {
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(3px, -14px) scale(0.3); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .ember-glow, .ember-tick, .ember-card, .ember-flame, .ember-flame path { animation: none; }
  .ember-spark, .ember-flame .f-spark { display: none; }
}
`;

/**
 * Flame on the card's top-left corner, sticking out of it: three layers (red, orange,
 * yellow) that flicker at different speeds, plus two sparks. Drawn here, not taken from an icon set.
 */
function Flame({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 42" aria-hidden="true" className={`ember-flame pointer-events-none ${className}`}>
      <defs>
        <linearGradient id="ember-flame-outer" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff7a2a" />
          <stop offset="1" stopColor="#d9261c" />
        </linearGradient>
        <linearGradient id="ember-flame-mid" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ff6a1a" />
        </linearGradient>
      </defs>
      <circle className="f-spark" cx="20" cy="9" r="1.2" fill="#ffd27a" />
      <circle className="f-spark f-spark-2" cx="11" cy="13" r="1" fill="#ffd27a" />
      <path
        className="f-outer"
        fill="url(#ember-flame-outer)"
        d="M16 2c1.6 6.6 11 10.6 11 23.4a11 11 0 0 1-22 0c0-6 3-9.8 6-12.8.1 3.8 1.8 6 3.8 7.2C13.4 13.2 14.2 6.6 16 2Z"
      />
      <path
        className="f-mid"
        fill="url(#ember-flame-mid)"
        d="M16 13c1 4.6 7.2 7 7.2 14.4a7.2 7.2 0 0 1-14.4 0c0-3.6 1.8-5.8 3.8-7.4.2 2.4 1.2 3.6 2.6 4.4-.6-3.6-.2-7.6.8-11.4Z"
      />
      <path
        className="f-core"
        fill="#ffe7a1"
        d="M16 22c.8 2.6 4 3.8 4 7.4a4 4 0 0 1-8 0c0-1.8 1-3 2-3.8.3 1.2.8 1.8 1.6 2.2-.3-1.8-.2-3.8.4-5.8Z"
      />
    </svg>
  );
}

// Fixed, not random: the server and the browser must draw the same sparks.
const SPARKS = [
  { left: "8%", dx: "10px", t: "5.5s", d: "0s" },
  { left: "21%", dx: "-8px", t: "6.8s", d: "1.9s" },
  { left: "37%", dx: "14px", t: "5.9s", d: "3.4s" },
  { left: "55%", dx: "-12px", t: "7.2s", d: "0.8s" },
  { left: "71%", dx: "9px", t: "6.1s", d: "2.7s" },
  { left: "88%", dx: "-10px", t: "5.4s", d: "4.2s" },
];

const UNITS = [
  { label: "Tage", ms: 86_400_000 },
  { label: "Std.", ms: 3_600_000 },
  { label: "Min.", ms: 60_000 },
  { label: "Sek.", ms: 1_000 },
];

function split(remaining: number) {
  let rest = remaining;
  return UNITS.map((unit) => {
    const value = Math.floor(rest / unit.ms);
    rest -= value * unit.ms;
    return value;
  });
}

/** Current time in the browser, ticking every `everyMs`. Null until the page runs (it may have been built long before). */
function useNow(everyMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Shows its content only until `endsAt`, so the page never announces an offer that is over. */
export function ShowUntil({ endsAt, children }: { endsAt: string; children: ReactNode }) {
  const now = useNow(30_000);
  return now !== null && now >= Date.parse(endsAt) ? null : children;
}

/**
 * Countdown to the real end of an offer: the shop's promotion (`site.promo`) or the
 * launch prices (`launchPricing`). The product page only renders it when that offer
 * really applies to the product; it hides itself once the end has passed and never starts over.
 */
export function PromoCountdown({
  label,
  heading,
  endsAt,
  children,
}: {
  /** Name of the section for screen readers. */
  label: string;
  heading: ReactNode;
  endsAt: string;
  /** The sentence under the countdown, saying when the offer ends and what happens then. */
  children: ReactNode;
}) {
  const end = Date.parse(endsAt);
  const now = useNow(1000);

  if (Number.isNaN(end) || (now !== null && now >= end)) return null;
  const parts = now === null ? null : split(end - now);

  return (
    <div className="relative mt-7">
      <section
        aria-label={label}
        className="ember-card text-paper relative isolate overflow-hidden rounded-2xl border border-[#ff5a1f]/35 bg-[#160c08] p-5 sm:p-6"
      >
        <style href="promo-ember" precedence="default">
          {EMBER_CSS}
        </style>
        {/* Glow like embers along the bottom edge: slow drift and flicker, never on a loop the eye can count. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="ember-glow absolute -inset-x-1/4 -bottom-1/4 h-[115%] blur-xl" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(22_12_8/0.85)_0%,rgb(22_12_8/0.35)_50%,transparent_85%)]" />
          {SPARKS.map((spark, index) => (
            <span
              key={index}
              className="ember-spark absolute bottom-0 size-1 rounded-full bg-[#ffb15c] shadow-[0_0_6px_2px_rgb(255_120_40/0.7)]"
              style={{ left: spark.left, "--dx": spark.dx, "--t": spark.t, "--d": spark.d } as CSSProperties}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="pl-5 text-[11px] font-semibold tracking-[0.14em] uppercase sm:pl-4 sm:tracking-[0.2em]">{heading}</p>
          <p className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-[#ffb489]/80 uppercase sm:tracking-[0.2em]">Endet in</p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3" role="timer" aria-live="off">
          {UNITS.map((unit, index) => {
            const seconds = index === UNITS.length - 1;
            const value = parts ? String(parts[index]).padStart(2, "0") : "–";
            return (
              <div
                key={unit.label}
                className={`rounded-xl border py-3 text-center backdrop-blur-sm ${
                  seconds ? "border-[#ff5a1f]/40 bg-[#ff5a1f]/10" : "border-paper/10 bg-paper/6"
                }`}
              >
                <span
                  key={seconds ? value : undefined}
                  className={`font-display block text-3xl leading-none font-semibold tabular-nums sm:text-4xl ${
                    seconds ? "ember-tick text-[#ff9a5c] [text-shadow:0_0_14px_rgb(255_90_31/0.75)]" : ""
                  }`}
                >
                  {value}
                </span>
                <span className="text-paper/60 mt-1.5 block text-[10px] font-semibold tracking-[0.18em] uppercase">
                  {unit.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-paper/85 mt-4 text-sm leading-relaxed">{children}</p>
      </section>
      <Flame className="absolute -top-6 -left-3 z-10 h-12 w-9 sm:-top-7 sm:-left-4 sm:h-14 sm:w-11" />
    </div>
  );
}

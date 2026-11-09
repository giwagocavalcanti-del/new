import { useId } from "react";
import { construction, type Finish } from "@/data/catalogue";
import { swatchImages } from "@/data/photo-variants";

// Drawn illustration of a slat panel, generated from the finish colours.
// It stands in for product photography until the supplier's photos are added,
// so nobody else's images are ever used.

type Variant = "wall" | "detail" | "hero" | "room";

const SPECS: Record<Variant, { width: number; height: number; slats: number; floorY: number | null }> = {
  wall: { width: 400, height: 500, slats: 13, floorY: 444 },
  detail: { width: 400, height: 500, slats: 5, floorY: null },
  hero: { width: 1600, height: 720, slats: 42, floorY: null },
  room: { width: 1600, height: 900, slats: 40, floorY: 790 },
};

const PAINTED_WALL = "#e9e3da";

const slatRatio =
  construction.slatWidthMm && construction.gapMm
    ? construction.slatWidthMm / (construction.slatWidthMm + construction.gapMm)
    : 0.675;

function mix(hex: string, target: string, amount: number) {
  const channel = (colour: string, index: number) => parseInt(colour.slice(1 + index * 2, 3 + index * 2), 16);
  const blended = [0, 1, 2].map((index) =>
    Math.round(channel(hex, index) + (channel(target, index) - channel(hex, index)) * amount),
  );
  return `#${blended.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

// Integer hash rather than Math.random/Math.sin: the server and every browser
// must draw exactly the same slats or React reports a hydration mismatch.
function jitter(index: number, seed: number) {
  let hash = (Math.imul(index + 1, 374761393) + Math.imul(seed + 1, 668265263)) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

type Props = {
  finish: Finish;
  variant?: Variant;
  /** Same scene with a plain painted wall and no panels, for the before/after slider. */
  bare?: boolean;
  /** Accessible description. Leave out when the picture is decorative. */
  label?: string;
  className?: string;
};

export function SlatArt({ finish, variant = "wall", bare = false, label, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { width, height, slats: count, floorY } = SPECS[variant];
  const seed = [...finish.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const period = width / count;
  const slatWidth = period * slatRatio;
  const gap = period - slatWidth;
  const bottom = floorY ?? height;
  const top = 0;
  const panelHeight = bottom - top;

  const slats = Array.from({ length: count }, (_, index) => {
    const tone = jitter(index, seed) - 0.5;
    return {
      x: index * period + gap / 2,
      fill: tone > 0 ? mix(finish.slat, "#ffffff", tone * 0.16) : mix(finish.slat, "#000000", -tone * 0.22),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}bevel`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.2" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.72" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`${uid}cast`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.5" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}grain`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.6 0.006" numOctaves="2" seed={seed % 97} />
          <feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.1  0 0 0 0 0.05  1.5 0 0 0 -0.52" />
        </filter>
        <radialGradient id={`${uid}light`} cx="0.5" cy="0" r="0.95">
          <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}shade`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={`${uid}floor`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b9ad9d" />
          <stop offset="1" stopColor="#d9d0c3" />
        </linearGradient>
      </defs>

      {(top > 0 || bare) && <rect width={width} height={bare ? bottom : top} fill={PAINTED_WALL} />}

      {!bare && (
        <>
          <rect y={top} width={width} height={panelHeight} fill={finish.felt} />
          {slats.map((slat) => (
            <g key={slat.x}>
              <rect x={slat.x + slatWidth} y={top} width={gap * 0.7} height={panelHeight} fill={`url(#${uid}cast)`} />
              <rect x={slat.x} y={top} width={slatWidth} height={panelHeight} fill={slat.fill} />
              <rect x={slat.x} y={top} width={slatWidth} height={panelHeight} fill={`url(#${uid}bevel)`} />
            </g>
          ))}
          <rect y={top} width={width} height={panelHeight} filter={`url(#${uid}grain)`} opacity="0.55" />
        </>
      )}

      <rect width={width} height={bottom} fill={`url(#${uid}light)`} />
      <rect width={width} height={bottom} fill={`url(#${uid}shade)`} opacity={bare ? 0.35 : 1} />

      {floorY !== null && (
        <>
          <rect y={floorY} width={width} height={height - floorY} fill={`url(#${uid}floor)`} />
          <rect y={floorY} width={width} height="10" fill={`url(#${uid}shade)`} opacity="0.5" />
        </>
      )}
    </svg>
  );
}

/**
 * CSS background for small finish chips: a square of real wall cut from the finish's
 * photo (scripts/images/build-photos.mjs), over drawn stripes while it loads or if
 * the finish has no photo yet.
 */
export function swatchStyle(finish: Finish) {
  const stripes = `repeating-linear-gradient(90deg, ${finish.slat} 0 5px, ${finish.felt} 5px 7px)`;
  const photo = swatchImages[finish.id];
  return {
    backgroundColor: finish.felt,
    backgroundImage: photo ? `url(${photo}), ${stripes}` : stripes,
    backgroundSize: photo ? "cover, auto" : undefined,
    backgroundPosition: "center",
  };
}

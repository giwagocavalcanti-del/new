"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion, useVisibleFrame } from "@/components/motion/useVisibleFrame";

/** A warm pool of light that follows the pointer across the hero wall. */
export function HeroLight() {
  const glow = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0.72, y: 0.35, inside: false });
  const pos = useRef({ x: 0.72, y: 0.35 });

  useEffect(() => {
    const parent = glow.current?.parentElement;
    if (!parent) return;
    const move = (event: PointerEvent) => {
      const box = parent.getBoundingClientRect();
      target.current = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height, inside: true };
    };
    const leave = () => {
      target.current.inside = false;
    };
    parent.addEventListener("pointermove", move, { passive: true });
    parent.addEventListener("pointerleave", leave);
    return () => {
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
    };
  }, []);

  useVisibleFrame(glow, (time) => {
    if (prefersReducedMotion() || !glow.current) return;
    const goalX = target.current.inside ? target.current.x : 0.5 + Math.sin(time / 4200) * 0.3;
    const goalY = target.current.inside ? target.current.y : 0.4 + Math.cos(time / 5300) * 0.14;
    pos.current.x += (goalX - pos.current.x) * 0.06;
    pos.current.y += (goalY - pos.current.y) * 0.06;
    glow.current.style.background = `radial-gradient(circle at ${(pos.current.x * 100).toFixed(1)}% ${(pos.current.y * 100).toFixed(1)}%,rgb(255 186 110/.34) 0,rgb(255 186 110/0) 38%)`;
  });

  return <div ref={glow} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 mix-blend-screen motion-reduce:hidden" />;
}

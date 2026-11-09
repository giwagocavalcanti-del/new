"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { prefersReducedMotion, useVisibleFrame } from "@/components/motion/useVisibleFrame";

/** The room behind the hero: the camera drifts slowly and leans a little towards the pointer. */
export function HeroScene() {
  const scene = useRef<HTMLDivElement>(null);
  const lean = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const parent = scene.current?.parentElement;
    if (!parent) return;
    const move = (event: PointerEvent) => {
      const box = parent.getBoundingClientRect();
      target.current = {
        x: ((event.clientX - box.left) / box.width - 0.5) * 2,
        y: ((event.clientY - box.top) / box.height - 0.5) * 2,
      };
    };
    const leave = () => {
      target.current = { x: 0, y: 0 };
    };
    parent.addEventListener("pointermove", move, { passive: true });
    parent.addEventListener("pointerleave", leave);
    return () => {
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
    };
  }, []);

  useVisibleFrame(scene, () => {
    if (prefersReducedMotion() || !lean.current) return;
    pos.current.x += (target.current.x - pos.current.x) * 0.05;
    pos.current.y += (target.current.y - pos.current.y) * 0.05;
    lean.current.style.transform = `translate3d(${(-pos.current.x * 1.1).toFixed(3)}%,${(-pos.current.y * 0.8).toFixed(3)}%,0)`;
  });

  return (
    <div ref={scene} aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      <div ref={lean} className="absolute inset-0 will-change-transform">
        <div className="hero-camera">
          <Image src="/hero-wohnzimmer.jpg" alt="" fill priority quality={80} sizes="(max-width: 768px) 270vw, 110vw" className="object-cover" />
        </div>
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(30_20_14/0.5)_0%,rgb(30_20_14/0.38)_48%,rgb(30_20_14/0.66)_100%)]" />
    </div>
  );
}

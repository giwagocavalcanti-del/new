"use client";

import { useEffect, useRef, type RefObject } from "react";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Calls `tick` on every animation frame, but only while the element is on screen. */
export function useVisibleFrame(ref: RefObject<HTMLElement | null>, tick: (time: number) => void) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let visible = true;

    const loop = (time: number) => {
      frame = 0;
      latest.current(time);
      if (visible) frame = requestAnimationFrame(loop);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(loop);
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);
    frame = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/** Where the pointer is over an element, from 0 to 1. Touch counts only while the finger is down. */
export function usePointer(ref: RefObject<HTMLElement | null>) {
  const pointer = useRef({ x: 0.5, y: 0.5, inside: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      pointer.current = {
        x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
        inside: true,
      };
    };
    const leave = () => {
      pointer.current.inside = false;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") leave();
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerdown", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", leave);
    element.addEventListener("pointerup", up);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerdown", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", leave);
      element.removeEventListener("pointerup", up);
    };
  }, [ref]);

  return pointer;
}

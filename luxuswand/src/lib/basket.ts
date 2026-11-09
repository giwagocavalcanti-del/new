"use client";

// The basket lives in the browser (localStorage). Prices are never stored:
// they are recomputed from the catalogue every time, here and at checkout.

import { useMemo, useSyncExternalStore } from "react";
import { cleanLines, MAX_QTY, priceBasket, type BasketLine } from "@/lib/pricing";

const KEY = "basket.v1";
const EMPTY: BasketLine[] = [];

let lines: BasketLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const cleaned = cleanLines(JSON.parse(window.localStorage.getItem(KEY) ?? "[]"));
    lines = cleaned.length ? cleaned : EMPTY;
  } catch {
    lines = EMPTY;
  }
}

function commit(next: BasketLine[]) {
  lines = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Private windows can refuse storage; the basket then lasts for this visit only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  // Keeps two open tabs showing the same basket.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    loaded = false;
    load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return lines;
}

const getServerSnapshot = () => EMPTY;

export const basket = {
  add(slug: string, qty: number) {
    load();
    const existing = lines.find((line) => line.slug === slug);
    const nextQty = Math.min(MAX_QTY, (existing?.qty ?? 0) + qty);
    commit(
      existing
        ? lines.map((line) => (line.slug === slug ? { ...line, qty: nextQty } : line))
        : [...lines, { slug, qty: nextQty }],
    );
  },
  setQty(slug: string, qty: number) {
    load();
    if (qty < 1) return basket.remove(slug);
    commit(lines.map((line) => (line.slug === slug ? { ...line, qty: Math.min(MAX_QTY, qty) } : line)));
  },
  remove(slug: string) {
    load();
    commit(lines.filter((line) => line.slug !== slug));
  },
  clear() {
    commit(EMPTY);
  },
};

export function useBasket() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => ({ raw: current, ...priceBasket(current) }), [current]);
}

export const BASKET_DIALOG_ID = "basket";

export function openBasket() {
  const dialog = document.getElementById(BASKET_DIALOG_ID);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

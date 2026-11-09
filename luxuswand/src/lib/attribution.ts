"use client";

// Remembers which advert or link brought the visitor here, but only after the
// visitor agrees. Until then the details stay in memory and are never stored.

import { useSyncExternalStore } from "react";
import { site } from "@/config/site";
import { cleanTrackingParams, type TrackingParams } from "@/lib/attribution-params";

const CONSENT_KEY = "attribution.consent";
const PARAMS_KEY = "attribution.params";

/** "unknown" is what the server renders: it cannot see the visitor's earlier answer. */
export type Consent = "unknown" | "undecided" | "granted" | "denied";

let consent: Consent = "undecided";
let fromAddress: TrackingParams | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function store(params: TrackingParams) {
  try {
    window.localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
  } catch {
    // Storage refused: the details still reach this visit's checkout from memory.
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const answer = window.localStorage.getItem(CONSENT_KEY);
    if (answer === "granted" || answer === "denied") consent = answer;
  } catch {
    // No storage: the visitor is simply asked again next time.
  }
  fromAddress = cleanTrackingParams(Object.fromEntries(new URLSearchParams(window.location.search)));
  // A newer advert click replaces what was remembered before.
  if (consent === "granted" && fromAddress) store(fromAddress);
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useConsent(): Consent {
  return useSyncExternalStore(
    subscribe,
    () => (load(), consent),
    () => "unknown",
  );
}

export function answerConsent(answer: "granted" | "denied") {
  load();
  consent = answer;
  try {
    window.localStorage.setItem(CONSENT_KEY, answer);
    if (answer === "denied") window.localStorage.removeItem(PARAMS_KEY);
  } catch {
    // The answer still holds for this visit.
  }
  if (answer === "granted" && fromAddress) store(fromAddress);
  listeners.forEach((listener) => listener());
}

/** What the checkout sends with an order. Without consent, nothing about adverts. */
export function currentAttribution(): { consent: boolean; params: TrackingParams | null } {
  load();
  if (!site.attribution.enabled || consent !== "granted") return { consent: false, params: null };
  let remembered: TrackingParams | null = null;
  try {
    remembered = cleanTrackingParams(JSON.parse(window.localStorage.getItem(PARAMS_KEY) ?? "null"));
  } catch {
    // Unreadable storage: fall back to what this visit's address carried.
  }
  return { consent: true, params: remembered ?? fromAddress };
}

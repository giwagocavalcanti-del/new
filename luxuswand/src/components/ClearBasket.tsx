"use client";

import { useEffect } from "react";
import { CHECKOUT_KEY, DETAILS_KEY } from "@/components/CheckoutForm";
import { basket } from "@/lib/basket";

/** Empties the basket and the checkout draft once an order is placed. */
export function ClearBasket() {
  useEffect(() => {
    basket.clear();
    try {
      window.sessionStorage.removeItem(CHECKOUT_KEY);
      window.sessionStorage.removeItem(DETAILS_KEY);
    } catch {
      // storage refused: nothing was saved there
    }
  }, []);
  return null;
}

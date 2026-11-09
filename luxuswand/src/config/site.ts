// Every fact the shop states about itself lives here.
// `null` means "not confirmed yet": the site leaves that information out
// (or flags it while in preview) instead of inventing it.

import type { TimelineConfig } from "@/lib/order-timeline";

export type DeliveryOption = {
  id: string;
  label: string;
  pricePence: number;
  minDays: number;
  maxDays: number;
};

/** A quantity break: from `minQty` panels of the same product, each one costs `unitPence`. */
export type VolumeDiscount = { minQty: number; unitPence: number };

export type SiteConfig = {
  name: string;
  strapline: string;
  /**
   * True while the catalogue, prices and policies are example data.
   * Shows the preview ribbon, asks search engines not to index the site,
   * and makes checkout refuse live payment keys.
   */
  sampleMode: boolean;
  locale: string;
  currency: "eur";
  pricesIncludeVat: boolean | null;
  company: {
    legalName: string | null;
    representative: string | null;
    companyNumber: string | null;
    vatNumber: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  delivery: {
    /** ISO country codes the shop ships to. */
    countries: ["DE"];
    /** Working days between payment and the parcel leaving the warehouse. */
    dispatchDays: { min: number; max: number } | null;
    options: DeliveryOption[];
    /** Basket value from which delivery is free; null = never free. */
    freeOverPence: number | null;
  };
  /** Days the customer has to withdraw from an order. The right of withdrawal lasts at least 14 days. */
  returnsDays: number;
  /** Per-product quantity breaks, applied to each basket line. A break that is not below the product's own price is ignored. */
  volumeDiscounts: VolumeDiscount[];
  /** Quantities offered as ready-made choices on the product page. */
  featuredQuantities: number[];
  /**
   * Delivery timeline on the tracking page: when "being prepared" shows, the forecast
   * window after posting, when to say the shop is checking, and the forecast of a new
   * attempt. Working days skip weekends, the national holidays and `extraHolidays`.
   */
  tracking: TimelineConfig;
  /**
   * Sale banner, and the countdown card on the product pages. The "up to X% off" figure is
   * computed from the catalogue, never typed here. Only for a real promotion: the products
   * need a real former price (`compareAtPence`), and `endsAt` is the real end, with time
   * zone (e.g. "2026-11-30T23:59:00+01:00"). The countdown shows only on discounted products
   * with an end date, and disappears when it is reached. Have it reviewed legally first.
   */
  promo: { label: string; endsAt: string | null } | null;
  /** Marketing measurement: which advert or link led to each order (reported to UTMify). */
  attribution: {
    /** False switches the whole feature off: no consent notice, nothing remembered, nothing sent. */
    enabled: boolean;
    /**
     * False (the cautious default): an order is only reported when the customer
     * accepted the consent notice. True: every paid order is reported, without
     * advert details when the customer declined. Take legal advice before changing.
     */
    shareOrdersWithoutConsent: boolean;
  };
};

export const site: SiteConfig = {
  name: "LuxusWand",
  strapline: "Lamellen-Wandpaneele aus Holz",
  sampleMode: true,
  locale: "de-DE",
  currency: "eur",
  pricesIncludeVat: null,
  company: {
    legalName: null,
    representative: null,
    companyNumber: null,
    vatNumber: null,
    address: null,
    email: null,
    phone: null,
  },
  delivery: {
    countries: ["DE"],
    dispatchDays: { min: 1, max: 2 },
    options: [
      { id: "standard", label: "Standardversand", pricePence: 995, minDays: 3, maxDays: 5 },
      { id: "express", label: "Expressversand", pricePence: 1995, minDays: 1, maxDays: 2 },
    ],
    freeOverPence: 10000,
  },
  returnsDays: 14,
  // Unit prices set by the owner on 07/11/2026 for the Black November price of 8,99 € per panel.
  // When the panel price changes (1/12/2026), set these again: they are fixed amounts, not percentages.
  volumeDiscounts: [
    { minQty: 10, unitPence: 789 },
    { minQty: 20, unitPence: 699 },
    { minQty: 30, unitPence: 649 },
  ],
  featuredQuantities: [5, 10, 20, 30],
  tracking: {
    preparingAfterMinutes: 60,
    transitWorkingDays: { min: 2, max: 3 },
    checkAfterWorkingDays: 3,
    retryAfterWorkingDays: 2,
    extraHolidays: [],
  },
  promo: null,
  attribution: { enabled: true, shareOrdersWithoutConsent: false },
};

// Dates the shop shows to customers are always in German time, wherever the page is built.

import { site } from "@/config/site";

export const SHOP_TIME_ZONE = "Europe/Berlin";

const dateFormat = new Intl.DateTimeFormat(site.locale, {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(site.locale, { timeZone: SHOP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** "31. Dezember 2026" */
export const shopDate = (iso: string) => dateFormat.format(new Date(iso));

/** "31. Dezember 2026 um 23:59 Uhr" */
export const shopDateTime = (iso: string) => `${shopDate(iso)} um ${timeFormat.format(new Date(iso))} Uhr`;

/** The day after a moment, e.g. the first day of the new prices: "1. Januar 2027". */
export const shopDayAfter = (iso: string) => dateFormat.format(new Date(Date.parse(iso) + 1000));

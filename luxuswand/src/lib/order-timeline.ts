// The delivery timeline on the tracking page: what really happened (payment,
// carrier and staff reports, the customer's confirmation) and what the shop
// expects next (posting day, delivery window, next attempt). The two are kept
// apart: a forecast is always marked as one, and nothing bad is ever assumed
// just because the customer has not confirmed yet.
//
// Plain dates ("2026-11-13") are calendar days in Germany; timestamps are ISO
// strings. No imports on purpose, so `npm run test:timeline` can run this file
// directly with Node.

export type TimelineConfig = {
  /** Minutes after payment before the order shows "being prepared". */
  preparingAfterMinutes: number;
  /** Working days from posting to "out for delivery": the window shown as a forecast. */
  transitWorkingDays: { min: number; max: number };
  /** Working days out for delivery without a result before the page says the shop is checking. */
  checkAfterWorkingDays: number;
  /** Working days after a failed attempt until the next one, when the carrier gives no date. */
  retryAfterWorkingDays: number;
  /** Extra days without posting or delivery (YYYY-MM-DD), on top of the national holidays. */
  extraHolidays: string[];
};

export type TimelineEvent = { status: string; occurred_at: string };

export type TimelineInput = {
  paidAt: string;
  now: Date;
  /** Real delivery reports, in any order. */
  events: TimelineEvent[];
  receivedConfirmedAt: string | null;
  /** Next attempt as reported by the carrier or staff. */
  nextAttemptOn: string | null;
  config: TimelineConfig;
};

/** "at": it happened then. "expected" and "window": a forecast, never a fact. */
export type StepDate =
  | { kind: "at"; at: string }
  | { kind: "expected"; on: string }
  | { kind: "window"; from: string; to: string };

export type TimelineStep = {
  key: string;
  title: string;
  text: string | null;
  state: "done" | "current" | "upcoming";
  date: StepDate | null;
};

export type Timeline = {
  steps: TimelineStep[];
  /** What the customer reads first: the current step. */
  headline: { title: string; text: string };
  /** Out for delivery for a while, no result from the carrier, no confirmation. */
  checking: boolean;
  /** The customer may press "received". */
  canConfirm: boolean;
  /** Receipt confirmed by the customer or the carrier: the flow is over. */
  closed: boolean;
};

// ---------------------------------------------------------------- Calendar

const BERLIN = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Germany of a moment: "2026-11-13". */
export function germanDate(at: string | Date): string {
  return BERLIN.format(typeof at === "string" ? new Date(at) : at);
}

function toUtc(day: string) {
  return new Date(`${day}T12:00:00Z`);
}

function addDays(day: string, count: number) {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Easter Sunday (Gregorian), by the anonymous Gregorian algorithm. */
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The nine public holidays observed in all of Germany. */
export function nationalHolidays(year: number): string[] {
  const easter = easterSunday(year);
  return [
    `${year}-01-01`, // Neujahr
    addDays(easter, -2), // Karfreitag
    addDays(easter, 1), // Ostermontag
    `${year}-05-01`, // Tag der Arbeit
    addDays(easter, 39), // Christi Himmelfahrt
    addDays(easter, 50), // Pfingstmontag
    `${year}-10-03`, // Tag der Deutschen Einheit
    `${year}-12-25`, // 1. Weihnachtstag
    `${year}-12-26`, // 2. Weihnachtstag
  ];
}

export function isWorkingDay(day: string, extraHolidays: string[] = []) {
  const weekday = toUtc(day).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const year = Number(day.slice(0, 4));
  return !nationalHolidays(year).includes(day) && !extraHolidays.includes(day);
}

/** The first working day after `day`: Thursday gives Friday, Friday to Sunday give Monday. */
export function nextWorkingDay(day: string, extraHolidays: string[] = []) {
  let next = addDays(day, 1);
  while (!isWorkingDay(next, extraHolidays)) next = addDays(next, 1);
  return next;
}

export function addWorkingDays(day: string, count: number, extraHolidays: string[] = []) {
  let result = day;
  for (let i = 0; i < count; i++) result = nextWorkingDay(result, extraHolidays);
  return result;
}

// ---------------------------------------------------------------- Timeline

const POSTED = new Set(["dispatched", "in_transit", "out_for_delivery", "delivered", "delivery_attempted", "back_at_depot"]);
/** A report from the carrier that says how the delivery went (or that it stopped). */
const RESULT = new Set(["delivered", "delivery_attempted", "back_at_depot", "exception", "returned", "cancelled"]);
const STOPPED = new Set(["returned", "cancelled"]);
/** Any report that means the parcel reached the delivery round (or got past it). */
const ON_ROUTE = new Set(["out_for_delivery", ...RESULT]);

const workingDaysText = (count: number) => (count === 1 ? "einem Werktag" : `${count} Werktagen`);

export function buildTimeline(input: TimelineInput): Timeline {
  const { config, now } = input;
  const holidays = config.extraHolidays;
  const today = germanDate(now);
  const events = [...input.events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const first = (statuses: Set<string> | string) =>
    events.find((event) => (typeof statuses === "string" ? event.status === statuses : statuses.has(event.status)));
  const latest = events.at(-1) ?? null;

  const receivedAt = input.receivedConfirmedAt ?? first("delivered")?.occurred_at ?? null;
  const closed = receivedAt !== null;

  // 1. Paid.
  const steps: TimelineStep[] = [
    {
      key: "confirmed",
      title: "Bestellung bestätigt",
      text: "Bestellung bestätigt! Wir haben deine Zahlung erhalten.",
      state: "done",
      date: { kind: "at", at: input.paidAt },
    },
  ];

  // 2. Being prepared: a staff or carrier report, or simply a while after payment.
  const preparingEvent = first("preparing");
  const posted = first(POSTED);
  const preparingDue = Date.parse(input.paidAt) + config.preparingAfterMinutes * 60_000 <= now.getTime();
  steps.push({
    key: "preparing",
    title: "Wird vorbereitet",
    text: "Wir bereiten dein Produkt für den Versand vor.",
    state: preparingEvent || posted || preparingDue ? "done" : "upcoming",
    date: preparingEvent ? { kind: "at", at: preparingEvent.occurred_at } : null,
  });

  // 3. Posting: the next working day after the purchase, until the carrier reports it.
  const plannedPosting = nextWorkingDay(germanDate(input.paidAt), holidays);
  const postingDay = posted ? germanDate(posted.occurred_at) : plannedPosting;
  steps.push({
    key: "posted",
    title: "Versand",
    text: posted ? "Dein Paket wurde an den Kurierdienst übergeben." : "Geplant für den nächsten Werktag nach deiner Bestellung.",
    state: posted ? "done" : "upcoming",
    date: posted ? { kind: "at", at: posted.occurred_at } : { kind: "expected", on: plannedPosting },
  });

  // 4. Out for delivery: forecast window after posting, until the carrier reports it.
  const window = {
    from: addWorkingDays(postingDay, config.transitWorkingDays.min, holidays),
    to: addWorkingDays(postingDay, config.transitWorkingDays.max, holidays),
  };
  const reachedRoute = first(ON_ROUTE);
  steps.push({
    key: "out_for_delivery",
    title: "In Zustellung",
    text: reachedRoute ? "Dein Paket ist auf dem Weg zu dir." : null,
    state: reachedRoute ? "done" : "upcoming",
    date: reachedRoute ? { kind: "at", at: reachedRoute.occurred_at } : { kind: "window", ...window },
  });

  // 5. Failed attempts and new attempts: only what the carrier or staff reported.
  let attempted = false;
  let lastAttempt: TimelineEvent | null = null;
  for (const event of events) {
    if (event === reachedRoute && event.status === "out_for_delivery") continue;
    if (event.status === "delivery_attempted") {
      attempted = true;
      lastAttempt = event;
      steps.push({
        key: `attempt-${event.occurred_at}`,
        title: "Zustellung nicht möglich",
        text: `Die Zustellung konnte nicht abgeschlossen werden. Dein Produkt ist auf dem Rückweg zum Logistikzentrum. Ein neuer Zustellversuch ist in ${workingDaysText(config.retryAfterWorkingDays)} geplant.`,
        state: "done",
        date: { kind: "at", at: event.occurred_at },
      });
    } else if (event.status === "back_at_depot") {
      attempted = true;
      lastAttempt ??= event;
      const next = input.nextAttemptOn ?? addWorkingDays(germanDate(lastAttempt.occurred_at), config.retryAfterWorkingDays, holidays);
      steps.push({
        key: `depot-${event.occurred_at}`,
        title: "Zurück im Logistikzentrum",
        text: `Dein Produkt ist wieder im Logistikzentrum. Der nächste Zustellversuch ist für ${longDate(next)} geplant.`,
        state: "done",
        date: { kind: "at", at: event.occurred_at },
      });
    } else if (event.status === "out_for_delivery" && attempted) {
      lastAttempt = null;
      steps.push({
        key: `again-${event.occurred_at}`,
        title: "Wieder in Zustellung",
        text: "Dein Produkt ist wieder in Zustellung.",
        state: "done",
        date: { kind: "at", at: event.occurred_at },
      });
    }
  }

  // Forecast of the next attempt while the parcel waits at the depot.
  const waitingForAttempt = !closed && latest && (latest.status === "delivery_attempted" || latest.status === "back_at_depot") && lastAttempt;
  if (waitingForAttempt) {
    steps.push({
      key: "next_attempt",
      title: "Neuer Zustellversuch",
      text: null,
      state: "upcoming",
      date: {
        kind: "expected",
        on: input.nextAttemptOn ?? addWorkingDays(germanDate(lastAttempt!.occurred_at), config.retryAfterWorkingDays, holidays),
      },
    });
  }

  // 6. Received: confirmed by the customer, or reported delivered by the carrier.
  steps.push({
    key: "received",
    title: "Erhalten",
    text: closed
      ? input.receivedConfirmedAt
        ? "Du hast den Empfang bestätigt. Viel Freude mit deinen Paneelen!"
        : "Der Kurierdienst hat die Zustellung gemeldet. Viel Freude mit deinen Paneelen!"
      : null,
    state: closed ? "done" : "upcoming",
    date: closed ? { kind: "at", at: receivedAt! } : null,
  });

  // The current step is the last one reached; once received, everything is done.
  if (!closed) {
    const lastDone = steps.findLastIndex((step) => step.state === "done");
    steps[lastDone] = { ...steps[lastDone], state: "current" };
  }
  const current = closed ? steps.at(-1)! : steps.find((step) => step.state === "current")!;

  // Out for delivery for a while with no result and no confirmation: say the shop is checking.
  // Only a note: no return or failed attempt is ever recorded because of it.
  const lastOut = [...events].reverse().find((event) => event.status === "out_for_delivery");
  const routeStart = lastOut ? germanDate(lastOut.occurred_at) : window.from;
  const resultSinceRoute = events.some(
    (event) => RESULT.has(event.status) && (!lastOut || Date.parse(event.occurred_at) >= Date.parse(lastOut.occurred_at)),
  );
  const checking = !closed && !resultSinceRoute && today >= addWorkingDays(routeStart, config.checkAfterWorkingDays, holidays);

  const stopped = latest !== null && STOPPED.has(latest.status);
  const canConfirm = !closed && !stopped && (posted !== undefined || today >= window.from);

  return {
    steps,
    headline: { title: current.title, text: current.text ?? "" },
    checking,
    canConfirm,
    closed,
  };
}

const LONG = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

/** "Montag, 16. November" for a plain date. */
export function longDate(day: string) {
  return LONG.format(toUtc(day));
}

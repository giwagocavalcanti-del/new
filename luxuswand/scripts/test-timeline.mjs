// Checks the delivery timeline maths (working days, holidays, forecasts and the
// return flow) without a server or database.
//
//   npm run test:timeline
//
// Node runs the TypeScript file directly (type stripping), so this needs Node 23.6+.

import {
  addWorkingDays,
  buildTimeline,
  germanDate,
  nationalHolidays,
  nextWorkingDay,
} from "../src/lib/order-timeline.ts";

let passed = 0;
const failures = [];
function check(name, ok, got) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}`);
    if (got !== undefined) console.log(`        got: ${JSON.stringify(got)}`);
  }
}

const config = {
  preparingAfterMinutes: 60,
  transitWorkingDays: { min: 2, max: 3 },
  checkAfterWorkingDays: 3,
  retryAfterWorkingDays: 2,
  extraHolidays: [],
};

console.log("\nCalendar");
check("Easter-based holidays 2026", JSON.stringify(nationalHolidays(2026)) === JSON.stringify(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-10-03", "2026-12-25", "2026-12-26"]), nationalHolidays(2026));
check("Easter-based holidays 2027", nationalHolidays(2027)[1] === "2027-03-26" && nationalHolidays(2027)[2] === "2027-03-29", nationalHolidays(2027));
check("bought on Thursday: posted Friday", nextWorkingDay("2026-11-12") === "2026-11-13");
check("bought on Friday: posted Monday", nextWorkingDay("2026-11-13") === "2026-11-16");
check("bought on Saturday: posted Monday", nextWorkingDay("2026-11-14") === "2026-11-16");
check("bought on Sunday: posted Monday", nextWorkingDay("2026-11-15") === "2026-11-16");
check("bought on Monday: posted Tuesday", nextWorkingDay("2026-11-16") === "2026-11-17");
check("Christmas: Thursday 24 Dec gives Monday 28", nextWorkingDay("2026-12-24") === "2026-12-28");
check("Easter: Thursday before gives Tuesday after", nextWorkingDay("2026-04-02") === "2026-04-07");
check("3 October on a Friday is skipped", nextWorkingDay("2025-10-02") === "2025-10-06");
check("an extra closing day is skipped too", nextWorkingDay("2026-11-12", ["2026-11-13"]) === "2026-11-16");
check("two working days after Friday is Tuesday", addWorkingDays("2026-11-13", 2) === "2026-11-17");
check("German date of a late UTC evening is the next day", germanDate("2026-11-12T23:30:00Z") === "2026-11-13");

const paidThursday = "2026-11-12T09:00:00Z"; // 10:00 in Berlin
const at = (iso) => new Date(iso);
const step = (timeline, key) => timeline.steps.find((s) => s.key === key);
const current = (timeline) => timeline.steps.find((s) => s.state === "current")?.key;
const base = { paidAt: paidThursday, events: [], receivedConfirmedAt: null, nextAttemptOn: null, config };

console.log("\nForecasts");
let t = buildTimeline({ ...base, now: at("2026-11-12T09:10:00Z") });
check("just paid: order confirmed is the current step", current(t) === "confirmed" && t.headline.text.startsWith("Bestellung bestätigt! Wir haben deine Zahlung erhalten"), t.headline);
check("preparing not shown before the interval", step(t, "preparing").state === "upcoming");
check("posting forecast for Friday, marked as forecast", JSON.stringify(step(t, "posted").date) === JSON.stringify({ kind: "expected", on: "2026-11-13" }));
check("delivery window two to three working days after posting", JSON.stringify(step(t, "out_for_delivery").date) === JSON.stringify({ kind: "window", from: "2026-11-17", to: "2026-11-18" }), step(t, "out_for_delivery").date);
check("cannot confirm receipt before anything could arrive", t.canConfirm === false);

t = buildTimeline({ ...base, now: at("2026-11-12T10:30:00Z") });
check("after the interval: being prepared", current(t) === "preparing" && t.headline.text === "Wir bereiten dein Produkt für den Versand vor.");

t = buildTimeline({ ...base, paidAt: "2026-11-13T15:00:00Z", now: at("2026-11-13T18:00:00Z") });
check("paid on Friday: posting forecast for Monday", step(t, "posted").date.on === "2026-11-16");

t = buildTimeline({ ...base, now: at("2026-11-17T09:00:00Z") });
check("in the delivery window the customer may confirm", t.canConfirm === true && t.checking === false);
check("a forecast is never shown as done", step(t, "posted").state === "upcoming" && step(t, "out_for_delivery").state === "upcoming");

console.log("\nNo confirmation, no carrier news");
t = buildTimeline({ ...base, now: at("2026-11-23T09:00:00Z") });
check("after the check time: 'verifying' note", t.checking === true);
check("but no failed attempt or return is invented", !t.steps.some((s) => s.key.startsWith("attempt") || s.key.startsWith("depot") || s.key === "next_attempt"));

const events = [
  { status: "dispatched", occurred_at: "2026-11-13T10:00:00Z" },
  { status: "out_for_delivery", occurred_at: "2026-11-16T07:00:00Z" },
];
t = buildTimeline({ ...base, events, now: at("2026-11-19T12:00:00Z") });
check("carrier out for delivery three working days ago, nothing since: verifying", t.checking === true && current(t) === "out_for_delivery");
t = buildTimeline({ ...base, events, now: at("2026-11-17T12:00:00Z") });
check("out for delivery one day: no note yet", t.checking === false);
check("real posting replaces the forecast", JSON.stringify(step(t, "posted").date) === JSON.stringify({ kind: "at", at: "2026-11-13T10:00:00Z" }));

console.log("\nFailed attempt, back at the depot, new attempt");
const attempt = [...events, { status: "delivery_attempted", occurred_at: "2026-11-17T11:00:00Z" }];
t = buildTimeline({ ...base, events: attempt, now: at("2026-11-17T12:00:00Z") });
check("failed attempt is the current step, with the return text", current(t)?.startsWith("attempt") && t.headline.text.startsWith("Die Zustellung konnte nicht abgeschlossen werden. Dein Produkt ist auf dem Rückweg zum Logistikzentrum. Ein neuer Zustellversuch ist in 2 Werktagen geplant."), t.headline);
check("next attempt forecast two working days later", JSON.stringify(step(t, "next_attempt")?.date) === JSON.stringify({ kind: "expected", on: "2026-11-19" }), step(t, "next_attempt"));
check("no 'verifying' note while the carrier has reported", t.checking === false);

const depot = [...attempt, { status: "back_at_depot", occurred_at: "2026-11-18T08:00:00Z" }];
t = buildTimeline({ ...base, events: depot, now: at("2026-11-18T09:00:00Z") });
check("back at the depot, with the date of the next attempt", t.headline.text === "Dein Produkt ist wieder im Logistikzentrum. Der nächste Zustellversuch ist für Donnerstag, 19. November geplant.", t.headline);
t = buildTimeline({ ...base, events: depot, nextAttemptOn: "2026-11-20", now: at("2026-11-18T09:00:00Z") });
check("the carrier's date wins over the forecast", t.headline.text.includes("Freitag, 20. November") && step(t, "next_attempt").date.on === "2026-11-20");

const again = [...depot, { status: "out_for_delivery", occurred_at: "2026-11-19T07:00:00Z" }];
t = buildTimeline({ ...base, events: again, now: at("2026-11-19T09:00:00Z") });
check("out again: 'wieder in Zustellung' is current", current(t)?.startsWith("again") && t.headline.text === "Dein Produkt ist wieder in Zustellung.", t.headline);
check("the next-attempt forecast is gone", !step(t, "next_attempt"));
check("the timeline keeps every real step in order", t.steps.map((s) => s.key.split("-")[0]).join() === "confirmed,preparing,posted,out_for_delivery,attempt,depot,again,received", t.steps.map((s) => s.key));

console.log("\nReceipt");
t = buildTimeline({ ...base, events: again, receivedConfirmedAt: "2026-11-19T15:00:00Z", now: at("2026-11-25T09:00:00Z") });
check("confirmed by the customer: flow closed, every step done", t.closed && t.steps.every((s) => s.state === "done") && t.headline.title === "Erhalten", t.steps.map((s) => s.state));
check("closed: no button, no note", !t.canConfirm && !t.checking);
t = buildTimeline({ ...base, events: [...events, { status: "delivered", occurred_at: "2026-11-16T14:00:00Z" }], now: at("2026-11-25T09:00:00Z") });
check("delivered reported by the carrier also closes it", t.closed && step(t, "received").text.startsWith("Der Kurierdienst hat die Zustellung gemeldet"));
t = buildTimeline({ ...base, events: [...events, { status: "returned", occurred_at: "2026-11-20T10:00:00Z" }], now: at("2026-11-25T09:00:00Z") });
check("returned to the sender: no receipt button", t.canConfirm === false && t.checking === false);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("Failed:\n  - " + failures.join("\n  - "));
  process.exit(1);
}

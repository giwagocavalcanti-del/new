// Sends one of the emails written by the local end-to-end test to a real inbox,
// through Resend, to see it in Gmail, Outlook or on a phone.
//
//   npm run test:e2e                               (writes .local-db/emails/)
//   node scripts/send-test-email.mjs you@example.com [confirmation|dispatched|out_for_delivery|delivered]
//
// Needs RESEND_API_KEY in .env.local. EMAIL_FROM is optional: without it the
// email goes out from Resend's test address, which Resend only delivers to the
// email of the Resend account itself. The sender name is always the shop's.
// The subject says it is a test; nothing about a real order is sent. Photos and links are
// pointed at the published shop, since the local test shop is not reachable from an inbox.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOP_NAME = "LuxusWand";
/** The emails are written by the local test shop: their photos and links point to it, which no inbox can reach. */
const LIVE_SITE = "https://luxuswand.store";

const [to, kind = "confirmation"] = process.argv.slice(2);
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: node scripts/send-test-email.mjs you@example.com [confirmation|dispatched|out_for_delivery|delivered]");
  process.exit(1);
}

const env = Object.fromEntries(
  existsSync(path.join(ROOT, ".env.local"))
    ? readFileSync(path.join(ROOT, ".env.local"), "utf8")
        .split("\n")
        .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, "")])
    : [],
);
const key = process.env.RESEND_API_KEY ?? env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is missing: add it to .env.local (it is never committed).");
  process.exit(1);
}
const configured = process.env.EMAIL_FROM ?? env.EMAIL_FROM;
const address = configured?.match(/<([^<>]+)>\s*$/)?.[1] ?? configured ?? "onboarding@resend.dev";

const dir = path.join(ROOT, ".local-db/emails");
const file = existsSync(dir) ? readdirSync(dir).find((name) => name.endsWith(`-${kind}.html`)) : null;
if (!file) {
  console.error(`No ${kind} email in .local-db/emails/: run npm run test:e2e first.`);
  process.exit(1);
}
// Photos and links go to the published shop instead. A test tracking link opens there as "not found".
const html = readFileSync(path.join(dir, file), "utf8").replace(/http:\/\/(localhost|127\.0\.0\.1):3311/g, LIVE_SITE);
const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? kind;

const reply = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    from: `${SHOP_NAME} <${address.trim()}>`,
    to: [to],
    subject: title.startsWith("[Test]") ? title : `[Test] ${title}`,
    html,
  }),
});
const answer = await reply.json().catch(() => ({}));
if (!reply.ok) {
  console.error(`Resend refused it (${reply.status}): ${answer.message ?? JSON.stringify(answer)}`);
  process.exit(1);
}
console.log(`Sent ${file} to ${to} from ${SHOP_NAME} <${address.trim()}> (Resend id ${answer.id}).`);

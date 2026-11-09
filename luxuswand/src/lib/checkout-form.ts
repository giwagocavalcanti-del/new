// The contact and delivery details of the checkout page. The same checks run
// in the browser (to point at a mistake straight away) and on the server
// (which never trusts what the browser sends).

import { site } from "@/config/site";

export type CheckoutDetails = {
  email: string;
  name: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postcode: string;
  city: string;
  country: string;
};

export type CheckoutField = keyof CheckoutDetails | "deliveryOptionId";
export type FieldErrors = Partial<Record<CheckoutField, string>>;

export const EMPTY_DETAILS: CheckoutDetails = {
  email: "",
  name: "",
  phone: "",
  line1: "",
  line2: "",
  postcode: "",
  city: "",
  country: site.delivery.countries[0],
};

const LIMITS: Record<keyof CheckoutDetails, number> = {
  email: 254,
  name: 120,
  phone: 30,
  line1: 120,
  line2: 120,
  postcode: 10,
  city: 80,
  country: 2,
};

// Deliberately simple: one @, something on both sides, a dot in the domain, no spaces.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE_DE = /^\d{5}$/;
const PHONE = /^\+?[0-9 ()/-]{6,}$/;
// Letters of any language, digits and the punctuation addresses really use.
// Rejects angle brackets and control characters, which have no place in an address.
const PLAIN_TEXT = /^[\p{L}\p{M}\p{N} .,'’/&()#+-]+$/u;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

/** Checks the details field by field. Messages are in German, for the customer. */
export function parseCheckoutDetails(input: unknown): { details: CheckoutDetails } | { errors: FieldErrors } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const read = (field: keyof CheckoutDetails) => {
    const value = text(body[field], LIMITS[field]);
    if (value.length > LIMITS[field]) errors[field] = `Bitte höchstens ${LIMITS[field]} Zeichen.`;
    return value;
  };

  const email = read("email").toLowerCase();
  const name = read("name");
  const phone = read("phone");
  const line1 = read("line1");
  const line2 = read("line2");
  const postcode = read("postcode").replace(/\s/g, "");
  const city = read("city");
  const country = read("country").toUpperCase();

  if (!EMAIL.test(email)) errors.email ??= "Bitte gib eine gültige E-Mail-Adresse ein.";
  if (name.length < 2) errors.name ??= "Bitte gib deinen vollständigen Namen ein.";
  else if (!PLAIN_TEXT.test(name)) errors.name ??= "Der Name enthält Zeichen, die wir nicht verarbeiten können.";
  if (phone && !PHONE.test(phone)) errors.phone ??= "Bitte gib eine gültige Telefonnummer ein oder lass das Feld leer.";
  if (line1.length < 3 || !/\d/.test(line1)) errors.line1 ??= "Bitte gib Straße und Hausnummer ein.";
  else if (!PLAIN_TEXT.test(line1)) errors.line1 ??= "Die Adresse enthält Zeichen, die wir nicht verarbeiten können.";
  if (line2 && !PLAIN_TEXT.test(line2)) errors.line2 ??= "Der Adresszusatz enthält Zeichen, die wir nicht verarbeiten können.";
  if (!(site.delivery.countries as string[]).includes(country)) errors.country ??= "Wir liefern derzeit nur innerhalb Deutschlands.";
  else if (country === "DE" && !POSTCODE_DE.test(postcode)) errors.postcode ??= "Bitte gib eine fünfstellige Postleitzahl ein.";
  if (city.length < 2) errors.city ??= "Bitte gib deinen Ort ein.";
  else if (!PLAIN_TEXT.test(city)) errors.city ??= "Der Ort enthält Zeichen, die wir nicht verarbeiten können.";

  if (Object.keys(errors).length) return { errors };
  return {
    details: { email, name, phone: phone || null, line1, line2: line2 || null, postcode, city, country },
  };
}

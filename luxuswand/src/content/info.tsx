import Link from "next/link";
import type { ReactNode } from "react";
import { Faq } from "@/components/Faq";
import { Pending } from "@/components/Pending";
import { site } from "@/config/site";
import {
  deliveryOptionSentences,
  dispatchSentence,
  faqItems,
  freeDeliverySentence,
  returnsSummary,
} from "@/content/policies";

// Help and legal pages. Wording that depends on the business (who the seller is,
// where returns go) comes from the site configuration and is flagged while missing.

export type InfoPage = { title: string; description: string; Body: () => ReactNode };

const { company } = site;

function ContactLine() {
  if (!company.email && !company.phone) return <Pending>E-Mail-Adresse und Telefonnummer des Kundenservice</Pending>;
  return (
    <>
      {company.email && <a href={`mailto:${company.email}`}>{company.email}</a>}
      {company.email && company.phone && " oder "}
      {company.phone && <a href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>}
    </>
  );
}

function LegalReviewNotice() {
  if (!site.sampleMode) return null;
  return (
    <p>
      <Pending>Diese Seite ist eine Vorlage und muss noch juristisch geprüft werden</Pending>
    </p>
  );
}

export const infoPages: Record<string, InfoPage> = {
  delivery: {
    title: "Versand",
    description: "Liefergebiet, Versandkosten und Lieferzeiten.",
    Body: () => (
      <>
        <h2>Wohin wir liefern</h2>
        <p>Wir liefern an Adressen in Deutschland.</p>
        <h2>Kosten und Lieferzeiten</h2>
        {dispatchSentence() && <p>{dispatchSentence()}</p>}
        {deliveryOptionSentences().length > 0 ? (
          <ul>
            {deliveryOptionSentences().map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        ) : (
          <p>Die Versandkosten siehst du an der Kasse, bevor du bezahlst.</p>
        )}
        {freeDeliverySentence() && <p>{freeDeliverySentence()}</p>}
        <p>Die Versandart wählst du an der Kasse. Die Kosten siehst du dort, bevor du bezahlst.</p>
        <h2>Wenn etwas beschädigt ankommt</h2>
        <p>
          Sag uns so schnell wie möglich Bescheid, damit wir uns darum kümmern können. Du erreichst uns unter{" "}
          <ContactLine />.
        </p>
      </>
    ),
  },

  returns: {
    title: "Widerruf & Rückgabe",
    description: "So widerrufst du eine Bestellung und so bekommst du dein Geld zurück.",
    Body: () => (
      <>
        <LegalReviewNotice />
        <h2>Widerrufsrecht</h2>
        <p>{returnsSummary()}</p>
        <p>
          Um zu widerrufen, schreib uns unter <ContactLine />.
        </p>
        <p>
          <Pending>vollständige Widerrufsbelehrung mit Muster-Widerrufsformular sowie Name und Anschrift des Verkäufers</Pending>
        </p>
        <h2>Erstattung</h2>
        <p>
          Wir erstatten den Preis der Paneele und die bezahlten Standardversandkosten über dein ursprüngliches
          Zahlungsmittel, und zwar innerhalb von 14 Tagen, nachdem wir die Paneele zurückerhalten haben oder du uns den
          Nachweis der Rücksendung gezeigt hast.
        </p>
        <p>
          <Pending>wer die Kosten der Rücksendung trägt und die Rücksendeadresse</Pending>
        </p>
        <h2>Mangelhafte oder beschädigte Paneele</h2>
        <p>
          Wenn ein Paneel mangelhaft ist oder nicht der Beschreibung entspricht, gelten die gesetzlichen Mängelrechte.
          Melde dich bei uns, wir kümmern uns darum.
        </p>
      </>
    ),
  },

  faq: {
    title: "Hilfe & FAQ",
    description: "Antworten auf die häufigsten Fragen.",
    Body: () => (
      <div>
        <Faq items={faqItems()} />
      </div>
    ),
  },

  contact: {
    title: "Kontakt",
    description: "So erreichst du uns.",
    Body: () => (
      <>
        <p>
          Du hast Fragen zu einer Bestellung oder zu den Paneelen? Du erreichst uns unter <ContactLine />.
        </p>
        <h2>Wer wir sind</h2>
        <p>
          {company.legalName ?? <Pending>Firmenname</Pending>}
          {company.companyNumber && `, Registernummer ${company.companyNumber}`}
        </p>
        <p>{company.address ?? <Pending>Geschäftsadresse</Pending>}</p>
      </>
    ),
  },

  terms: {
    title: "AGB",
    description: "Die Bedingungen, die für deine Bestellung bei uns gelten.",
    Body: () => (
      <>
        <LegalReviewNotice />
        <h2>Bei wem du kaufst</h2>
        <p>
          {site.name} wird betrieben von {company.legalName ?? <Pending>Firmenname, Registernummer und Anschrift</Pending>}
          {company.address && `, ${company.address}`}.
        </p>
        <h2>Bestellungen</h2>
        <p>
          Deine Bestellung ist ein Angebot zum Kauf. Der Vertrag zwischen uns kommt zustande, sobald deine Zahlung an der
          Kasse bestätigt ist. Die Preise sind in Euro angegeben
          {site.pricesIncludeVat === true && " und enthalten die MwSt."}
          {site.pricesIncludeVat === false && " und enthalten keine MwSt."}. Der Versand wird gesondert berechnet und vor
          der Zahlung angezeigt.
        </p>
        {site.pricesIncludeVat === null && (
          <p>
            <Pending>Angabe, ob die Preise die MwSt. enthalten</Pending>
          </p>
        )}
        <h2>Versand, Widerruf und Mängel</h2>
        <p>
          Siehe unsere Seiten <Link href="/info/delivery">Versand</Link> und{" "}
          <Link href="/info/returns">Widerruf &amp; Rückgabe</Link>. Deine gesetzlichen Rechte bleiben von diesen
          Bedingungen unberührt.
        </p>
        <h2>Anwendbares Recht</h2>
        <p>
          <Pending>anwendbares Recht und Gerichtsstand</Pending>
        </p>
      </>
    ),
  },

  privacy: {
    title: "Datenschutz",
    description: "Welche personenbezogenen Daten wir erheben und warum.",
    Body: () => (
      <>
        <LegalReviewNotice />
        <h2>Wer verantwortlich ist</h2>
        <p>
          Verantwortlich für die Datenverarbeitung ist {company.legalName ?? <Pending>Firmenname und Anschrift</Pending>}.
        </p>
        <h2>Welche Daten wir erheben</h2>
        <p>
          Wenn du bestellst, erhalten wir deinen Namen, deine Lieferadresse, deine E-Mail-Adresse und, wenn du sie
          angibst, deine Telefonnummer. Wir verwenden sie nur, um die Bestellung zu liefern und dich dazu zu
          kontaktieren. Die Zahlung wird von Stripe verarbeitet: Stripe erhält dafür deinen Namen, deine E-Mail-Adresse,
          deine Lieferadresse und den Betrag. Deine Kartendaten gehen direkt an Stripe und erreichen uns nie.
        </p>
        <h2>E-Mails zu deiner Bestellung</h2>
        <p>
          Die Bestätigung deiner Bestellung und die Nachrichten zum Versand (Paket unterwegs, in Zustellung, zugestellt)
          versenden wir über den E-Mail-Dienst Resend. Dafür erhält er deinen Namen, deine E-Mail-Adresse, deine
          Lieferadresse, was du bestellt und bezahlt hast sowie Kurierdienst und Sendungsnummer.
        </p>
        <p>
          <Pending>Firmenangaben von Resend und wie Daten geschützt sind, die außerhalb der EU übermittelt werden</Pending>
        </p>
        <h2>Dein Warenkorb</h2>
        <p>
          Der Inhalt deines Warenkorbs wird in deinem eigenen Browser gespeichert, damit er noch da ist, wenn du
          wiederkommst. Was du an der Kasse eingibst, bleibt nur in diesem Browser-Tab gespeichert, bis du ihn
          schließt oder die Bestellung abgeschlossen ist.
        </p>
        {site.attribution.enabled ? (
          <>
            <h2>Messung unserer Werbung</h2>
            <p>
              Wir fragen dich, ob wir unsere Werbung messen dürfen. Wenn du zustimmst, merkt sich dein Browser, welche
              Anzeige oder welcher Link dich hergeführt hat. Wenn du bestellst, senden wir die Bestellung (deinen Namen,
              deine E-Mail-Adresse, dein Land, was du gekauft und was du bezahlt hast) zusammen mit diesen
              Werbeangaben an UTMify, den Dienst, mit dem wir sehen, welche Anzeigen zu Verkäufen führen.{" "}
              {site.attribution.shareOrdersWithoutConsent
                ? "Wenn du ablehnst, wird nichts über Werbung gespeichert und deine Bestellung wird ohne Werbeangaben an UTMify gesendet."
                : "Wenn du ablehnst, wird nichts gespeichert und nichts an UTMify gesendet."}{" "}
              Deine Antwort selbst wird in deinem Browser gespeichert, damit wir nicht bei jedem Besuch fragen. Wenn du
              die Daten dieser Website in deinem Browser löschst, wird sie zurückgesetzt.
            </p>
            <p>
              <Pending>Firmenangaben von UTMify und wie Daten geschützt sind, die außerhalb der EU übermittelt werden</Pending>
            </p>
          </>
        ) : (
          <p>Diese Website setzt keine Werbe- oder Analyse-Cookies.</p>
        )}
        <h2>Lieferung</h2>
        <p>
          Um deine Bestellung zu liefern, geben wir deinen Namen, deine Lieferadresse, deine E-Mail-Adresse und deine
          Telefonnummer an unseren Lieferpartner und dessen Kurierdienste weiter.
        </p>
        <h2>Deine Rechte</h2>
        <p>
          Du kannst eine Kopie deiner Daten anfordern und verlangen, dass wir sie berichtigen oder löschen. Du erreichst
          uns unter <ContactLine />.
        </p>
        <p>
          <Pending>vollständige Datenschutzerklärung mit Rechtsgrundlagen, Speicherdauer und Beschwerderecht</Pending>
        </p>
      </>
    ),
  },

  impressum: {
    title: "Impressum",
    description: "Angaben zum Anbieter dieser Website.",
    Body: () => (
      <>
        <LegalReviewNotice />
        <h2>Anbieter</h2>
        <p>{company.legalName ?? <Pending>Name bzw. Firma mit Rechtsform</Pending>}</p>
        <p>{company.address ?? <Pending>vollständige Anschrift</Pending>}</p>
        <h2>Vertreten durch</h2>
        <p>{company.representative ?? <Pending>vertretungsberechtigte Person</Pending>}</p>
        <h2>Kontakt</h2>
        <p>
          <ContactLine />
        </p>
        <h2>Registereintrag</h2>
        <p>{company.companyNumber ?? <Pending>Registergericht und Registernummer, falls vorhanden</Pending>}</p>
        <h2>Umsatzsteuer-Identifikationsnummer</h2>
        <p>{company.vatNumber ?? <Pending>USt-IdNr., falls vorhanden</Pending>}</p>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>
          <Pending>Angabe zur Teilnahme an Streitbeilegungsverfahren</Pending>
        </p>
      </>
    ),
  },
};

export function getInfoPage(slug: string): InfoPage | undefined {
  return Object.hasOwn(infoPages, slug) ? infoPages[slug] : undefined;
}

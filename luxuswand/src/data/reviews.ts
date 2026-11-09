// Customer reviews. Only real reviews from real buyers go in here, never
// invented or edited ones, and the page always says where they come from.
//
// The reviews below come from the owner's other LuxusWand online shop in Germany
// (a separate website, not this one), supplied by the owner on 07/11/2026 as a
// finished page; the owner confirmed that they are real, that only buyers can
// review there and that the photos were posted by the customers. They were
// written in German, so nothing was translated. The texts are copied unchanged.
// That shop showed no names, so none are shown here either.

export type Review = {
  /** 1 to 5. */
  rating: number;
  /** The customer's own words, unchanged. */
  text: string;
  /** The customer's own photo, if they posted one (public/reviews/). */
  photo: string | null;
  /** Description of the photo for screen readers. */
  photoAlt: string;
  /** Which part of the photo stays visible in the card (CSS object-position). */
  photoFocus: string;
};

export type ReviewSource = {
  /** Where the reviews were written, in German, as shown on the page. */
  origin: string;
  /**
   * How the original shop makes sure a review comes from a real buyer, in German.
   * Shoppers must be told whether and how reviews are checked; null = not
   * confirmed yet, flagged while in preview.
   */
  verification: string | null;
};

export const reviewSource: ReviewSource = {
  origin: "Diese Bewertungen stammen aus unserem anderen LuxusWand-Onlineshop, nicht aus diesem Shop.",
  // Confirmed by the owner on 07/11/2026.
  verification: "Dort bewerten nur Kundinnen und Kunden, die im Shop gekauft haben.",
};

export const reviews: Review[] = [
  {
    rating: 5,
    text: "Die Bestellung war unkompliziert und das Paket kam pünktlich an. Das Produkt entspricht der Beschreibung. Ich bin sehr zufrieden.",
    photo: "/reviews/de-1.webp",
    photoAlt: "Holzpaneel mit Grünpflanze",
    photoFocus: "center 69%",
  },
  {
    rating: 5,
    text: "Tolle Qualität und sorgfältig verpackt. Die Lieferung war schnell und alles kam in einwandfreiem Zustand an. Gerne wieder!",
    photo: "/reviews/de-2.webp",
    photoAlt: "Holzpaneele an Wand und Decke eines Büros",
    photoFocus: "center 59%",
  },
  {
    rating: 5,
    text: "Ich hatte eine Frage zu meiner Bestellung und bekam schnell eine hilfreiche Antwort. Auch die Sendungsverfolgung hat problemlos funktioniert.",
    photo: "/reviews/de-3.webp",
    photoAlt: "Sitzecke mit Holzpaneelen und Lichtleiste",
    photoFocus: "center 65%",
  },
  {
    rating: 5,
    text: "Das Produkt hat meine Erwartungen erfüllt und ist einfach zu bedienen. Von der Bestellung bis zur Lieferung lief alles reibungslos.",
    photo: "/reviews/de-4.webp",
    photoAlt: "Holzpaneel mit schwebender Konsole",
    photoFocus: "15% 70%",
  },
];

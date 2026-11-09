import Image from "next/image";
import { Pending } from "@/components/Pending";
import { reviewSource, reviews, type Review } from "@/data/reviews";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="bg-surface relative z-10 mx-auto -mt-6 flex w-fit gap-0.5 rounded-xl px-4 py-2 text-[#e8a317] shadow-[0_5px_14px_rgb(0_0_0/0.13)]">
      <span className="sr-only">{rating} von 5 Sternen</span>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          width="22"
          height="22"
          aria-hidden="true"
          fill={index < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <path d="M10 1.8l2.47 5.1 5.6.78-4.07 3.92 1 5.57L10 14.5l-5 2.67 1-5.57-4.07-3.92 5.6-.78L10 1.8Z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <li className="bg-surface flex flex-col overflow-hidden rounded-xl shadow-[0_6px_14px_rgb(0_0_0/0.12)]">
      {review.photo ? (
        <div className="bg-sand relative aspect-[294/212]">
          <Image
            src={review.photo}
            alt={`Foto der Kundin oder des Kunden: ${review.photoAlt}`}
            fill
            quality={90}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            style={{ objectPosition: review.photoFocus }}
          />
        </div>
      ) : (
        <div className="h-8" />
      )}
      <Stars rating={review.rating} />
      <blockquote className="px-5 pt-4 pb-6 text-center leading-relaxed">„{review.text}“</blockquote>
    </li>
  );
}

export function Reviews() {
  if (reviews.length === 0) return null;
  return (
    <section aria-labelledby="bewertungen" className="mt-20">
      <h2 id="bewertungen" className="display text-center text-3xl md:text-4xl">
        Kundenbewertungen
      </h2>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {reviews.map((review) => (
          <ReviewCard key={review.text} review={review} />
        ))}
      </ul>
      {/* The only place that says where the reviews come from: never remove it. */}
      <p className="text-muted mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed">
        {reviewSource.origin}{" "}
        {reviewSource.verification ?? (
          <Pending>wie geprüft wird, dass die Bewertungen von echten Käufern stammen</Pending>
        )}
      </p>
    </section>
  );
}

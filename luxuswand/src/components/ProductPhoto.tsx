import Image from "next/image";
import { photoVariants } from "@/data/photo-variants";

type Props = {
  /** Original path under /public, e.g. "/products/lamellen-wandpaneel-nussbaum.jpg". */
  src: string;
  alt: string;
  /** Same meaning as the `sizes` attribute: how wide the photo is shown. */
  sizes: string;
  /** The first photo on the page: load it straight away. */
  priority?: boolean;
  className?: string;
};

/**
 * A product photo that fills its (positioned) parent.
 *
 * Serves the AVIF and WebP widths built by scripts/images/build-photos.mjs, which keep
 * the full colour resolution, so the thin gaps between the slats stay sharp. A photo
 * that has not been through the script yet falls back to next/image.
 */
export function ProductPhoto({ src, alt, sizes, priority = false, className = "" }: Props) {
  const photo = photoVariants[src];
  const classes = `absolute inset-0 h-full w-full object-cover ${className}`;

  if (!photo) {
    return <Image src={src} alt={alt} fill priority={priority} quality={90} sizes={sizes} className={classes} />;
  }

  const srcSet = (ext: "avif" | "webp") => photo.widths.map((w) => `${photo.base}-${w}.${photo.id}.${ext} ${w}w`).join(", ");
  const largest = photo.widths[photo.widths.length - 1];

  return (
    <picture>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      {/* A plain <img>: next/image would re-encode these files and lose what the script keeps. */}
      <img
        src={`${photo.base}-${largest}.${photo.id}.webp`}
        srcSet={srcSet("webp")}
        sizes={sizes}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={classes}
      />
    </picture>
  );
}

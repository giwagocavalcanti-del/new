import Link from "next/link";
import { ProductPhoto } from "@/components/ProductPhoto";
import { SlatArt } from "@/components/SlatArt";
import { centimetres, type Product } from "@/data/catalogue";
import { formatMoney, percentOff } from "@/lib/pricing";

/** The supplier photo when there is one, otherwise the drawn illustration. */
export function ProductImage({ product, className, sizes }: { product: Product; className?: string; sizes?: string }) {
  const [photo] = product.photos;
  if (photo) {
    return <ProductPhoto src={photo} alt={product.name} sizes={sizes ?? "(min-width: 1024px) 25vw, 50vw"} className={className} />;
  }
  return (
    <SlatArt
      finish={product.finish}
      label={`Illustration: ${product.name}`}
      className={className}
    />
  );
}

export function Price({ product, className }: { product: Product; className?: string }) {
  return (
    <p className={`flex items-baseline justify-center gap-2 ${className ?? ""}`}>
      {percentOff(product) !== null && product.compareAtPence && (
        <s className="text-muted text-sm">
          <span className="sr-only">Vorher </span>
          {formatMoney(product.compareAtPence)}
        </s>
      )}
      <span className="font-semibold">{formatMoney(product.pricePence)}</span>
    </p>
  );
}

export function SaleBadge({ product, className }: { product: Product; className?: string }) {
  const off = percentOff(product);
  if (off === null) return null;
  return (
    <span
      className={`bg-sale text-paper rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase ${className ?? ""}`}
    >
      {off} % sparen
    </span>
  );
}

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  return (
    <Link href={`/products/${product.slug}`} className={`group block ${className ?? ""}`}>
      <div className="bg-sand relative aspect-[4/5] overflow-hidden rounded-xl">
        <ProductImage
          product={product}
          className="h-full w-full"
        />
        <SaleBadge product={product} className="absolute top-3 left-3" />
      </div>
      <h3 className="font-display mt-4 text-center text-lg leading-snug font-semibold">{product.name}</h3>
      <p className="text-muted mt-1 text-center text-xs">
        {centimetres(product.format.heightMm)} × {centimetres(product.format.widthMm)}
      </p>
      <Price product={product} className="mt-1.5 text-sm" />
    </Link>
  );
}

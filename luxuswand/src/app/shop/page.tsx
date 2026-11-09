import type { Metadata } from "next";
import { CollectionGrid } from "@/components/CollectionGrid";
import { panelSize, products } from "@/data/catalogue";

export const metadata: Metadata = {
  title: "Wandpaneele",
  description: "Alle Lamellen-Wandpaneele aus Holz in jeder Ausführung.",
};

export default function ShopPage() {
  const shopFormats = [...new Map(products.map((product) => [product.format.id, product.format])).values()];
  const only = shopFormats.length === 1 ? shopFormats[0] : null;

  return (
    <div className="shell py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Die Kollektion</p>
        <h1 className="display mt-2 text-5xl md:text-6xl">Wandpaneele</h1>
        <p className="text-muted mt-4 leading-relaxed">
          {only
            ? `Format ${only.name}, ${panelSize(only)}. Wähle deine Ausführung.`
            : "Filtere nach Höhe und wähle dann deine Ausführung."}
        </p>
      </div>
      <div className="mt-10">
        <CollectionGrid products={products} />
      </div>
    </div>
  );
}

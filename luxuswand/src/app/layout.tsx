import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { BasketDrawer } from "@/components/BasketDrawer";
import { ConsentNotice } from "@/components/ConsentNotice";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { site } from "@/config/site";
import { freeDeliverySentence } from "@/content/policies";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: `${site.name} · ${site.strapline}`, template: `%s · ${site.name}` },
  description: `${site.strapline} in verschiedenen Ausführungen, Lieferung innerhalb Deutschlands.`,
  // A preview full of example products must not end up in search results.
  robots: site.sampleMode ? { index: false, follow: false } : undefined,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const announcement = freeDeliverySentence();

  return (
    <html lang={site.locale} className={`${inter.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {site.sampleMode && (
          <p className="bg-ink text-paper px-4 py-2 text-center text-xs">
            <strong className="font-semibold">Vorschau.</strong> Beispielprodukte, Beispielpreise und Mustertexte. Dieser Shop
            nimmt noch keine Bestellungen an, es finden keine echten Verkäufe statt.
          </p>
        )}
        {announcement && (
          <p className="bg-bark text-paper/90 px-4 py-2 text-center text-[11px] tracking-[0.16em] uppercase">
            {announcement}
          </p>
        )}
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <BasketDrawer />
        <ConsentNotice />
      </body>
    </html>
  );
}

import Link from "next/link";
import { Pending } from "@/components/Pending";
import { site } from "@/config/site";
import { formats, panelSize } from "@/data/catalogue";

const HELP = [
  { href: "/track", label: "Sendung verfolgen" },
  { href: "/info/delivery", label: "Versand" },
  { href: "/info/returns", label: "Rückgabe" },
  { href: "/info/faq", label: "Hilfe & FAQ" },
  { href: "/info/contact", label: "Kontakt" },
];

const LEGAL = [
  { href: "/info/terms", label: "AGB" },
  { href: "/info/privacy", label: "Datenschutz" },
  { href: "/info/returns", label: "Widerruf" },
  { href: "/info/impressum", label: "Impressum" },
];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-[11px] font-semibold tracking-[0.2em] text-[#d9c3a0] uppercase">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="text-paper/80 hover:text-paper transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { company } = site;
  const identity = [
    company.legalName,
    company.companyNumber && `Registernummer ${company.companyNumber}`,
    company.vatNumber && `USt-IdNr. ${company.vatNumber}`,
    company.address,
  ].filter(Boolean);

  return (
    <footer className="bg-bark text-paper mt-24">
      <div className="shell grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-3xl font-semibold">{site.name}</p>
          <p className="text-paper/70 mt-3 max-w-xs text-sm leading-relaxed">{site.strapline}, Lieferung innerhalb Deutschlands.</p>
        </div>
        <Column
          title="Shop"
          links={[
            { href: "/shop", label: "Alle Paneele" },
            ...Object.values(formats).map((format) => ({
              href: "/shop",
              label: `${format.name} · ${panelSize(format)}`,
            })),
          ]}
        />
        <Column title="Hilfe" links={HELP} />
        <Column title="Rechtliches" links={LEGAL} />
      </div>
      <div className="border-paper/15 border-t">
        <div className="shell text-paper/70 flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{identity.length ? identity.join(" · ") : <Pending onDark>Firmenname, Registernummer und Anschrift</Pending>}</p>
          <p>Zahlungen werden sicher über Stripe abgewickelt.</p>
        </div>
      </div>
    </footer>
  );
}

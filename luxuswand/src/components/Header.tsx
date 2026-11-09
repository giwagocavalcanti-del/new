"use client";

import Link from "next/link";
import { useRef } from "react";
import { BagIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { site } from "@/config/site";
import { openBasket, useBasket } from "@/lib/basket";

export const NAV_LINKS = [
  { href: "/shop", label: "Paneele" },
  { href: "/track", label: "Sendung verfolgen" },
  { href: "/info/delivery", label: "Versand" },
  { href: "/info/returns", label: "Rückgabe" },
  { href: "/info/faq", label: "FAQ" },
  { href: "/info/contact", label: "Kontakt" },
];

export function Header() {
  const { count } = useBasket();
  const menu = useRef<HTMLDialogElement>(null);

  return (
    <header className="border-line bg-paper/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => menu.current?.showModal()}
            aria-label="Menü öffnen"
            className="-ml-2 grid size-10 cursor-pointer place-items-center md:hidden"
          >
            <MenuIcon />
          </button>
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
            {site.name}
          </Link>
        </div>

        <nav aria-label="Hauptnavigation" className="hidden gap-8 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brass-ink transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={openBasket}
          aria-label={`Warenkorb öffnen, ${count} Artikel`}
          className="relative -mr-2 grid size-10 cursor-pointer place-items-center"
        >
          <BagIcon />
          {count > 0 && (
            <span className="bg-bark text-paper absolute top-0.5 right-0 grid min-w-5 place-items-center rounded-full px-1 text-[10px] leading-5 font-semibold">
              {count}
            </span>
          )}
        </button>
      </div>

      <dialog
        ref={menu}
        aria-label="Menü"
        className="sheet sheet-left"
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <div className="flex h-full flex-col p-6">
          <div className="flex items-center justify-between">
            <span className="font-display text-2xl font-semibold">{site.name}</span>
            <button
              onClick={() => menu.current?.close()}
              aria-label="Menü schließen"
              className="-mr-2 grid size-10 cursor-pointer place-items-center"
            >
              <CloseIcon />
            </button>
          </div>
          <nav aria-label="Mobile Navigation" className="mt-8 flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => menu.current?.close()}
                className="border-line font-display border-b py-4 text-2xl"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </dialog>
    </header>
  );
}

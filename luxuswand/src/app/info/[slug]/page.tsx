import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInfoPage, infoPages } from "@/content/info";

// Every valid address is prerendered at build time, so nothing here waits on
// data. This tells Next.js not to ask for a loading placeholder on these pages.
export const instant = false;

export function generateStaticParams() {
  return Object.keys(infoPages).map((slug) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/info/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = getInfoPage(slug);
  return page ? { title: page.title, description: page.description } : {};
}

export default async function InfoPage(props: PageProps<"/info/[slug]">) {
  const { slug } = await props.params;
  const page = getInfoPage(slug);
  if (!page) notFound();

  return (
    <div className="shell max-w-3xl py-14">
      <h1 className="display text-5xl">{page.title}</h1>
      <p className="text-muted mt-3">{page.description}</p>
      <div className="prose-info mt-10">
        <page.Body />
      </div>
    </div>
  );
}

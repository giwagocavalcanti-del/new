import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell max-w-2xl py-24 text-center">
      <h1 className="display text-4xl md:text-5xl">Seite nicht gefunden</h1>
      <p className="text-muted mt-5">Diese Seite gibt es nicht oder sie wurde verschoben.</p>
      <Link href="/shop" className="btn btn-dark mt-9">
        Paneele ansehen
      </Link>
    </div>
  );
}

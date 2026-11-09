"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Reloads the page's data without losing the scroll position. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="btn btn-outline px-5 py-2.5"
    >
      {pending ? "Wird aktualisiert…" : "Aktualisieren"}
    </button>
  );
}

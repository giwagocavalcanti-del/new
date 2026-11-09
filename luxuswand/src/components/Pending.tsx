import type { ReactNode } from "react";
import { site } from "@/config/site";

/**
 * Marks a business detail that has not been supplied yet. Visible only while
 * the site is in preview; once live, a missing detail simply isn't shown.
 */
export function Pending({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  if (!site.sampleMode) return null;
  return (
    <span
      className={`rounded border border-dashed px-1.5 py-0.5 text-[0.85em] ${
        onDark ? "border-paper/50 text-paper" : "border-brass-ink/50 bg-brass/10 text-brass-ink"
      }`}
    >
      Vor dem Start zu ergänzen: {children}
    </span>
  );
}

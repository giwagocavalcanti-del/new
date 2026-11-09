import { ChevronIcon } from "@/components/icons";
import type { FaqItem } from "@/content/policies";

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-line border-line divide-y border-y">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-medium [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronIcon className="text-muted shrink-0 transition-transform group-open:rotate-90" />
          </summary>
          <p className="text-muted max-w-2xl pb-6 text-sm leading-relaxed">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

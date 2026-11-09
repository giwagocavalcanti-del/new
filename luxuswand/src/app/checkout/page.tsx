import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";

export const metadata: Metadata = { title: "Kasse", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <div className="shell max-w-6xl py-14">
      <CheckoutForm />
    </div>
  );
}

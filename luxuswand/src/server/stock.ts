import type { BasketLine } from "@/lib/pricing";
import { logCall, requireDb, type OrderRow } from "@/server/db";

// Stock is optional: only products with a row in `stock_levels` are limited.
// Everything else is ordered from the supplier and is not counted here.

export type Shortage = { slug: string; requested: number; available: number };

/** Products in the basket that do not have enough stock left. Empty when all is fine. */
export async function findShortages(lines: BasketLine[]): Promise<Shortage[]> {
  if (lines.length === 0) return [];
  const { data, error } = await requireDb()
    .from("stock_levels")
    .select("slug, available")
    .in(
      "slug",
      lines.map((line) => line.slug),
    );
  if (error) throw new Error(`Could not read the stock: ${error.message}`);

  const available = new Map((data ?? []).map((row: { slug: string; available: number }) => [row.slug, row.available]));
  return lines.flatMap((line) => {
    const left = available.get(line.slug);
    return left !== undefined && left < line.qty ? [{ slug: line.slug, requested: line.qty, available: left }] : [];
  });
}

/**
 * Takes the stock of a paid order, once: a repeated webhook does nothing.
 * Never throws, so a stock problem can not undo a confirmed payment; anything
 * short is saved on the order for staff to handle.
 */
export async function takeStock(order: OrderRow) {
  if (order.stock_taken_at) return;
  const { data, error } = await requireDb().rpc("take_order_stock", { p_order_id: order.id });
  if (error) {
    await logCall({ orderId: order.id, target: "stock", action: "stock.take", ok: false, detail: error.message });
    return;
  }
  const shortfall = (data ?? []) as unknown[];
  if (shortfall.length) {
    await logCall({ orderId: order.id, target: "stock", action: "stock.take", ok: false, detail: `Short: ${JSON.stringify(shortfall)}` });
  }
}

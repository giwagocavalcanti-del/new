import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatMoney } from "@/lib/pricing";
import { listOrders, type OrderFilter } from "@/server/admin";
import { currentAdmin } from "@/server/admin-auth";
import { db } from "@/server/db";
import { DELIVERY_PT, PAYMENT_PT, formatWhen } from "./labels";

export const metadata: Metadata = { title: "Equipe · Pedidos", robots: { index: false, follow: false } };

const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: "to_ship", label: "Aguardando envio" },
  { id: "shipped", label: "Enviados" },
  { id: "unpaid", label: "Não pagos" },
  { id: "all", label: "Todos" },
];

async function Orders({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection();
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (!db()) return <p className="text-muted mt-8">O banco de pedidos ainda não está configurado.</p>;

  const { filter: raw } = await searchParams;
  const filter = FILTERS.find((item) => item.id === raw)?.id ?? "to_ship";
  const orders = await listOrders(filter);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Equipe</p>
          <h1 className="display mt-2 text-4xl">Pedidos</h1>
        </div>
        <form method="post" action="/api/admin/logout" className="text-muted text-sm">
          {admin} ·{" "}
          <button className="cursor-pointer underline underline-offset-2">Sair</button>
        </form>
      </div>

      <nav className="mt-8 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((item) => (
          <Link
            key={item.id}
            href={`/admin?filter=${item.id}`}
            className={`rounded-full border px-4 py-2 ${item.id === filter ? "border-bark bg-bark text-paper" : "border-line"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="text-muted mt-8">Nenhum pedido aqui.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-muted border-line border-b text-xs uppercase">
              <tr>
                <th className="py-3 pr-4 font-medium">Pedido</th>
                <th className="py-3 pr-4 font-medium">Data</th>
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 font-medium">Total</th>
                <th className="py-3 pr-4 font-medium">Pagamento</th>
                <th className="py-3 font-medium">Entrega</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="py-3 pr-4 font-semibold">
                    <Link href={`/admin/orders/${order.ref}`} className="underline underline-offset-2">
                      {order.ref}
                    </Link>
                    {order.is_test && <span className="text-muted ml-1.5 text-xs font-normal">teste</span>}
                    {order.stock_shortfall && <span className="text-sale ml-1.5 text-xs font-normal">estoque!</span>}
                    {order.needsCheck && <span className="text-sale ml-1.5 text-xs font-normal">verificar entrega</span>}
                  </td>
                  <td className="py-3 pr-4">{formatWhen(order.created_at)}</td>
                  <td className="py-3 pr-4">{order.customer_name ?? "—"}</td>
                  <td className="py-3 pr-4">{order.total_pence !== null ? formatMoney(order.total_pence) : "—"}</td>
                  <td className="py-3 pr-4">{PAYMENT_PT[order.status]}</td>
                  <td className="py-3">
                    {order.status === "paid" ? (order.shipment?.received_confirmed_at ? "Recebido (confirmado pelo cliente)" : DELIVERY_PT[order.shipment?.status ?? "pending"]) : "—"}
                    {order.shipment?.tracking_number && <span className="text-muted block text-xs">{order.shipment.tracking_number}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <div lang="pt-BR" className="shell max-w-6xl py-14">
      <Suspense fallback={<p className="text-muted">Carregando pedidos…</p>}>
        <Orders searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

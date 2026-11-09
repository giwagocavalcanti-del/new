import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { site } from "@/config/site";
import { PARTNER_STATUSES } from "@/lib/delivery-status";
import { formatMoney } from "@/lib/pricing";
import { orderDetail } from "@/server/admin";
import { currentAdmin } from "@/server/admin-auth";
import { db } from "@/server/db";
import { emailEnabled } from "@/server/email";
import { normaliseRef } from "@/server/orders";
import { DELIVERY_PT, EMAIL_KIND_PT, EMAIL_STATUS_PT, PAYMENT_PT, formatWhen } from "../../labels";

export const metadata: Metadata = { title: "Equipe · Pedido", robots: { index: false, follow: false } };

const EMAIL_RESULT: Record<string, string> = {
  sent: "Email enviado.",
  failed: "O envio falhou de novo. Uma nova tentativa automática fica agendada.",
  rejected: "O serviço de email recusou o envio. Confira o endereço do cliente.",
  already_sent: "Esse email já tinha sido enviado.",
  busy: "Esse email está sendo enviado agora.",
  skipped: "Nada enviado: o serviço de email não está configurado ou o pedido não está pago.",
};

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-line bg-surface rounded-2xl border p-6">
    <h2 className="display text-2xl">{title}</h2>
    <div className="mt-4 text-sm">{children}</div>
  </section>
);

async function Detail({ params, searchParams }: PageProps<"/admin/orders/[ref]">) {
  await connection();
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (!db()) return <p className="text-muted">O banco de pedidos ainda não está configurado.</p>;

  const ref = normaliseRef((await params).ref);
  const detail = ref ? await orderDetail(ref) : null;
  if (!detail) return <p className="text-muted">Pedido não encontrado.</p>;

  const { order, items, shipment, events, audit, emails, log } = detail;
  const query = await searchParams;
  const notice =
    query.saved === "1"
      ? "Envio salvo."
      : query.unchanged === "1"
        ? "Nada mudou."
        : typeof query.email === "string"
          ? EMAIL_RESULT[query.email]
          : null;
  const error = typeof query.error === "string" ? query.error : null;
  const address = order.shipping_address;
  const field = "border-line mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5";
  const canShip = order.status === "paid";

  return (
    <>
      <Link href="/admin" className="text-muted text-sm underline underline-offset-2">
        ← Pedidos
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl">
          Pedido {order.ref}
          {order.is_test && <span className="text-muted ml-3 text-base font-normal">teste</span>}
        </h1>
        <Link href={`/track/${order.tracking_token}`} className="text-muted text-sm underline underline-offset-2" target="_blank">
          Ver como o cliente vê
        </Link>
      </div>

      {notice && <p className="border-line bg-surface mt-6 rounded-lg border px-3 py-2.5 text-sm">{notice}</p>}
      {error && (
        <p role="alert" className="border-sale/30 bg-sale/5 text-sale mt-6 rounded-lg border px-3 py-2.5 text-sm">
          {error}
        </p>
      )}
      {order.stock_shortfall && (
        <p className="border-sale/30 bg-sale/5 text-sale mt-6 rounded-lg border px-3 py-2.5 text-sm">
          Faltou estoque quando este pedido foi pago:{" "}
          {order.stock_shortfall.map((item) => `${item.slug} (pedido ${item.ordered}, havia ${item.available})`).join(", ")}.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Box title="Pagamento">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2">
            <dt className="text-muted">Situação</dt>
            <dd className="font-semibold">{PAYMENT_PT[order.status]}</dd>
            <dt className="text-muted">Criado</dt>
            <dd>{formatWhen(order.created_at)}</dd>
            <dt className="text-muted">Pago</dt>
            <dd>{formatWhen(order.paid_at)}</dd>
            {order.refunded_at && (
              <>
                <dt className="text-muted">Reembolsado</dt>
                <dd>{formatWhen(order.refunded_at)}</dd>
              </>
            )}
            {order.last_payment_error && (
              <>
                <dt className="text-muted">Última recusa</dt>
                <dd>{order.last_payment_error}</dd>
              </>
            )}
            <dt className="text-muted">Stripe</dt>
            <dd className="break-all">{order.stripe_payment_intent ?? order.stripe_session_id ?? "—"}</dd>
          </dl>
          <table className="mt-5 w-full">
            <tbody className="divide-line divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2">
                    {item.quantity} × {item.name}
                  </td>
                  <td className="py-2 text-right">{formatMoney(item.total_pence)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2">{order.delivery_service ?? "Frete"}</td>
                <td className="py-2 text-right">{order.delivery_pence !== null ? formatMoney(order.delivery_pence) : "—"}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{order.total_pence !== null ? formatMoney(order.total_pence) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </Box>

        <Box title="Cliente e entrega">
          <p className="font-semibold">{order.customer_name ?? "—"}</p>
          {address && (
            <p className="mt-1">
              {address.line1}
              {address.line2 && (
                <>
                  <br />
                  {address.line2}
                </>
              )}
              <br />
              {address.postcode} {address.city} · {address.country}
            </p>
          )}
          <p className="mt-3">{order.customer_email ?? "—"}</p>
          {order.customer_phone && <p>{order.customer_phone}</p>}
          {shipment && (
            <p className="text-muted mt-4">
              Parceiro de entrega:{" "}
              {shipment.request_status === "accepted"
                ? `aceito por ${shipment.partner}`
                : shipment.request_status === "not_configured"
                  ? "nenhum configurado (registre o envio abaixo)"
                  : shipment.request_status === "failed"
                    ? `falhou: ${shipment.request_error ?? "sem detalhe"}`
                    : "aguardando"}
            </p>
          )}
        </Box>

        <Box title="Envio">
          {!canShip ? (
            <p className="text-muted">Só pedidos pagos podem ser enviados. Este está: {PAYMENT_PT[order.status].toLowerCase()}.</p>
          ) : (
            <form method="post" action={`/api/admin/orders/${order.ref}/shipment`} className="space-y-4">
              <p>
                Situação atual: <strong>{DELIVERY_PT[shipment?.status ?? "pending"]}</strong>
              </p>
              {shipment?.received_confirmed_at && (
                <p className="text-muted">
                  O cliente confirmou o recebimento em {formatWhen(shipment.received_confirmed_at)}. O acompanhamento está encerrado.
                </p>
              )}
              <label className="block">
                <span className="font-medium">Nova situação</span>
                <select name="status" defaultValue="" className={field}>
                  <option value="">Manter como está</option>
                  {PARTNER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {DELIVERY_PT[status]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-medium">Transportadora</span>
                  <input name="carrier" defaultValue={shipment?.carrier ?? ""} placeholder="ex.: DHL" className={field} />
                </label>
                <label className="block">
                  <span className="font-medium">Código de rastreio</span>
                  <input name="tracking_number" defaultValue={shipment?.tracking_number ?? ""} className={field} />
                </label>
              </div>
              <label className="block">
                <span className="font-medium">Link de rastreio da transportadora</span>
                <input name="tracking_url" type="url" defaultValue={shipment?.tracking_url ?? ""} placeholder="https://…" className={field} />
              </label>
              <label className="block">
                <span className="font-medium">Previsão de entrega</span>
                <span className="text-muted block text-xs">Só preencha se a transportadora informou. Fica visível para o cliente.</span>
                <input name="estimated_delivery" type="date" defaultValue={shipment?.estimated_delivery ?? ""} className={field} />
              </label>
              <label className="block">
                <span className="font-medium">Data da nova tentativa de entrega</span>
                <span className="text-muted block text-xs">
                  Depois de &quot;Tentativa de entrega sem sucesso&quot; ou &quot;Voltou ao centro logístico&quot;, se a transportadora
                  informou. Sem ela, a página do cliente mostra uma previsão de {site.tracking.retryAfterWorkingDays} dias úteis, marcada como
                  previsão.
                </span>
                <input name="next_attempt_on" type="date" defaultValue={shipment?.next_attempt_on ?? ""} className={field} />
              </label>
              <label className="block">
                <span className="font-medium">Nota para o cliente</span>
                <span className="text-muted block text-xs">Opcional, em alemão. Aparece no histórico da página de rastreio.</span>
                <input name="note" maxLength={300} className={field} />
              </label>
              <p className="text-muted text-xs">
                Ao marcar &quot;Despachado&quot; (ou depois) com um código de rastreio, o cliente recebe o email de envio
                {emailEnabled() ? "" : " — mas o serviço de email ainda não está configurado"}. Os emails de &quot;saiu para
                entrega&quot; e &quot;entregue&quot; só saem com aviso do parceiro de entrega.
              </p>
              <button className="btn btn-dark">Salvar envio</button>
            </form>
          )}
        </Box>

        <Box title="Emails">
          {emails.length === 0 ? (
            <p className="text-muted">{emailEnabled() ? "Nenhum email ainda." : "O serviço de email não está configurado."}</p>
          ) : (
            <ul className="divide-line divide-y">
              {emails.map((email) => (
                <li key={email.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <strong>{EMAIL_KIND_PT[email.kind]}</strong>
                    <span className="text-muted block text-xs">
                      {EMAIL_STATUS_PT[email.status]} · {email.attempts} tentativa(s) · {formatWhen(email.sent_at ?? email.updated_at)}
                      {email.last_error && ` · ${email.last_error.slice(0, 120)}`}
                    </span>
                  </span>
                  {(email.status === "failed" || email.status === "rejected") && (
                    <form method="post" action={`/api/admin/orders/${order.ref}/email`}>
                      <input type="hidden" name="kind" value={email.kind} />
                      <button className="btn btn-outline px-4 py-2">Enviar de novo</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Box title="Histórico da entrega">
          {events.length === 0 ? (
            <p className="text-muted">Nenhum evento ainda.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{DELIVERY_PT[event.status]}</strong> · {formatWhen(event.occurred_at)}
                  <span className="text-muted block text-xs">
                    {event.source === "staff" ? "registrado pela equipe" : `parceiro ${event.source}`}
                    {event.location && ` · ${event.location}`}
                    {event.description && ` · ${event.description}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="Alterações da equipe e integrações">
          {audit.length === 0 && log.length === 0 ? (
            <p className="text-muted">Nada registrado.</p>
          ) : (
            <ul className="space-y-3">
              {audit.map((entry) => (
                <li key={`a${entry.id}`}>
                  <strong>{entry.actor}</strong> · {formatWhen(entry.created_at)}
                  <span className="text-muted block text-xs">
                    {Object.entries(entry.changes as Record<string, { from: unknown; to: unknown }>)
                      .map(([key, change]) => `${key}: ${String(change.from ?? "—")} → ${String(change.to ?? "—")}`)
                      .join(" · ")}
                  </span>
                </li>
              ))}
              {log.map((entry, index) => (
                <li key={`l${index}`}>
                  <strong className={entry.ok ? "" : "text-sale"}>
                    {entry.target} · {entry.action} {entry.ok ? "ok" : "falhou"}
                  </strong>{" "}
                  · {formatWhen(entry.created_at)}
                  {entry.detail && <span className="text-muted block text-xs break-all">{entry.detail.slice(0, 200)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </>
  );
}

export default function AdminOrderPage(props: PageProps<"/admin/orders/[ref]">) {
  return (
    <div lang="pt-BR" className="shell max-w-6xl py-14">
      <Suspense fallback={<p className="text-muted">Carregando pedido…</p>}>
        <Detail {...props} />
      </Suspense>
    </div>
  );
}

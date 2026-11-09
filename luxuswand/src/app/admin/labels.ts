// Staff pages are for the shop owner, in Portuguese. The customer never sees them.

import type { DeliveryStatus } from "@/lib/delivery-status";
import type { EmailKind, EmailStatus, OrderStatus } from "@/server/db";

export const PAYMENT_PT: Record<OrderStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  processing: "Pagamento em processamento",
  paid: "Pago",
  payment_failed: "Pagamento recusado",
  cancelled: "Cancelado (não pago)",
  refunded: "Reembolsado",
};

export const DELIVERY_PT: Record<DeliveryStatus, string> = {
  pending: "Aguardando envio",
  preparing: "Em preparação",
  dispatched: "Despachado",
  in_transit: "Em trânsito",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  delivery_attempted: "Tentativa de entrega sem sucesso (retornando)",
  back_at_depot: "Voltou ao centro logístico",
  exception: "Atraso ou problema",
  returned: "Devolvido ao remetente",
  cancelled: "Entrega cancelada",
};

export const EMAIL_KIND_PT: Record<EmailKind, string> = {
  confirmation: "Confirmação do pedido",
  dispatched: "Pedido despachado",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
};

export const EMAIL_STATUS_PT: Record<EmailStatus, string> = {
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou (nova tentativa automática)",
  rejected: "Recusado pelo serviço de email",
  skipped: "Dispensado (um email mais recente já saiu)",
};

const when = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatWhen = (value: string | null) => (value ? when.format(new Date(value)) : "—");

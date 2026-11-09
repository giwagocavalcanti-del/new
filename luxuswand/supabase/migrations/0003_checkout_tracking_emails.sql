-- Own checkout page, payment states, stock, staff shipment updates and the
-- transactional emails (confirmation, dispatch, out for delivery, delivered).
-- Run after 0001 and 0002. Safe to run once; every new table keeps row level
-- security on with no policies, so only the server (secret key) reaches it.

-- ---------------------------------------------------------------- Orders
-- Payment status, kept apart from the delivery status in `shipments`:
--   awaiting_payment  customer sent to Stripe, nothing confirmed yet
--   processing        Stripe accepted a payment method that settles later (e.g. SEPA debit)
--   paid              Stripe confirmed the money
--   payment_failed    the delayed payment did not go through
--   cancelled         abandoned or expired, never paid
--   refunded          paid and fully refunded
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting_payment', 'processing', 'paid', 'payment_failed', 'cancelled', 'refunded'));

alter table public.orders
  -- One value per checkout page load: pressing "pay" twice or reloading reuses the same order.
  add column checkout_key text unique,
  -- Fingerprint of what was ordered (items, address, delivery) for that key.
  add column checkout_fingerprint text,
  add column delivery_option_id text,
  add column processing_at timestamptz,
  add column payment_failed_at timestamptz,
  -- Last reason a card or payment was declined, as reported by Stripe.
  add column last_payment_error text,
  -- When stock was taken for this order, so a repeated webhook never takes it twice.
  add column stock_taken_at timestamptz,
  -- Products that were short when the order was paid, for staff to sort out.
  add column stock_shortfall jsonb;

-- ---------------------------------------------------------------- Shipments
-- "requesting": the shop is asking the delivery partner right now. Only one
-- request at a time, even when two webhooks arrive at the same moment.
alter table public.shipments drop constraint if exists shipments_request_status_check;
alter table public.shipments add constraint shipments_request_status_check
  check (request_status in ('pending', 'requesting', 'accepted', 'failed', 'not_configured'));

-- ---------------------------------------------------------------- Stock
-- Optional. A product with no row here is not limited (the supplier's stock is
-- not tracked). A row limits checkout to what is available.
create table public.stock_levels (
  slug text primary key,
  available integer not null check (available >= 0),
  updated_at timestamptz not null default now()
);

alter table public.stock_levels enable row level security;

-- Takes the stock of a paid order exactly once. Returns the products that were
-- short (empty when everything was available).
create or replace function public.take_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
as $$
declare
  shortfall jsonb := '[]'::jsonb;
  line record;
  left_over integer;
begin
  update public.orders set stock_taken_at = now()
   where id = p_order_id and stock_taken_at is null;
  if not found then
    return null;
  end if;

  for line in
    select slug, sum(quantity)::integer as quantity
      from public.order_items where order_id = p_order_id group by slug
  loop
    select available into left_over from public.stock_levels where slug = line.slug for update;
    if found then
      if left_over < line.quantity then
        shortfall := shortfall || jsonb_build_object('slug', line.slug, 'ordered', line.quantity, 'available', left_over);
      end if;
      update public.stock_levels
         set available = greatest(0, left_over - line.quantity), updated_at = now()
       where slug = line.slug;
    end if;
  end loop;

  if jsonb_array_length(shortfall) > 0 then
    update public.orders set stock_shortfall = shortfall where id = p_order_id;
  end if;
  return shortfall;
end;
$$;

revoke execute on function public.take_order_stock(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Staff changes
-- Every change a staff member makes to a shipment (carrier, tracking number,
-- status), with who made it. The customer-facing history stays in shipment_events.
create table public.shipment_audit (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments (id),
  actor text not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index shipment_audit_shipment_idx on public.shipment_audit (shipment_id, created_at);
alter table public.shipment_audit enable row level security;

-- ---------------------------------------------------------------- Emails
-- One row per email an order can receive. The unique pair (order, kind) is what
-- prevents the same email from going out twice.
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  kind text not null check (kind in ('confirmation', 'dispatched', 'out_for_delivery', 'delivered')),
  --   sending   being sent right now (or the sender stopped half-way: retried after a while)
  --   sent      the email service accepted it
  --   failed    temporary failure: the retry route tries again
  --   rejected  the email service refused it for good (e.g. invalid address)
  --   skipped   no longer worth sending (a later email of the same order already went out)
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'rejected', 'skipped')),
  recipient text,
  attempts integer not null default 0,
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, kind)
);

create index email_messages_status_idx on public.email_messages (status, updated_at);
alter table public.email_messages enable row level security;

-- Confirmations already sent under the old column count as sent.
insert into public.email_messages (order_id, kind, status, recipient, attempts, sent_at, updated_at)
select id, 'confirmation', 'sent', customer_email, 1, confirmation_email_sent_at, confirmation_email_sent_at
  from public.orders where confirmation_email_sent_at is not null
on conflict (order_id, kind) do nothing;

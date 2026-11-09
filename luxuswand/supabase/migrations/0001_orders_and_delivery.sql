-- Orders, their lines, the shipment of each order and its delivery history.
--
-- Row level security is switched on with no policies on purpose: the browser
-- keys can read and write nothing, and only the server (secret key) reaches
-- these tables.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Order number shown to the customer.
  ref text not null unique,
  -- Unguessable value used in the tracking link.
  tracking_token text not null unique,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'cancelled', 'refunded')),
  currency text not null,
  subtotal_pence integer not null check (subtotal_pence >= 0),
  delivery_pence integer check (delivery_pence >= 0),
  total_pence integer check (total_pence >= 0),
  -- What the payment provider kept, once known.
  gateway_fee_pence integer check (gateway_fee_pence >= 0),
  delivery_service text,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address jsonb,
  stripe_session_id text unique,
  stripe_payment_intent text,
  -- Whether the customer accepted marketing measurement, and what was captured.
  attribution_consent boolean not null default false,
  tracking_params jsonb,
  -- Last status successfully reported to UTMify, to know what still has to be sent.
  utmify_synced_status text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz
);

create index orders_customer_email_idx on public.orders (lower(customer_email));
create index orders_payment_intent_idx on public.orders (stripe_payment_intent);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  slug text not null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_pence integer not null check (unit_pence >= 0),
  total_pence integer not null check (total_pence >= 0),
  height_mm integer,
  width_mm integer,
  depth_mm integer,
  weight_kg numeric
);

create index order_items_order_idx on public.order_items (order_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  -- Where the parcel is, as last reported by the delivery partner.
  status text not null default 'pending'
    check (status in (
      'pending', 'preparing', 'dispatched', 'in_transit', 'out_for_delivery',
      'delivered', 'delivery_attempted', 'exception', 'returned', 'cancelled'
    )),
  -- Whether the delivery partner has been asked to create the shipment.
  request_status text not null default 'pending'
    check (request_status in ('pending', 'accepted', 'failed', 'not_configured')),
  request_attempts integer not null default 0,
  request_error text,
  requested_at timestamptz,
  partner text,
  partner_shipment_id text,
  carrier text,
  tracking_number text,
  tracking_url text,
  estimated_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipments_partner_shipment_idx on public.shipments (partner, partner_shipment_id);

create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id),
  -- Which partner sent the update, and that partner's own id for it.
  source text not null,
  external_id text not null,
  status text not null
    check (status in (
      'preparing', 'dispatched', 'in_transit', 'out_for_delivery',
      'delivered', 'delivery_attempted', 'exception', 'returned', 'cancelled'
    )),
  description text,
  location text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  -- A partner resending the same update must not create a second entry.
  unique (source, external_id)
);

create index shipment_events_shipment_idx on public.shipment_events (shipment_id, occurred_at);

-- One line per call made to an outside service, to see what was sent and what failed.
create table public.integration_log (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id),
  target text not null,
  action text not null,
  ok boolean not null,
  http_status integer,
  detail text,
  created_at timestamptz not null default now()
);

create index integration_log_order_idx on public.integration_log (order_id, created_at);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_events enable row level security;
alter table public.integration_log enable row level security;

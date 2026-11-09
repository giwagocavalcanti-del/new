-- Details for the order confirmation email. Run after 0004. Safe to run once.

-- How the customer paid, as shown to them: for example "Visa •••• 4242" or
-- "SEPA-Lastschrift". Read from Stripe once the payment is confirmed; never the
-- full card or account number (Stripe does not hand it out either).
alter table public.orders add column if not exists payment_method text;

-- The single-panel price at the time of the order, next to the price actually
-- charged (`unit_pence`), so the confirmation can show the quantity discount
-- even after the catalogue prices change. Null for orders saved before this column.
alter table public.order_items
  add column if not exists list_unit_pence integer check (list_unit_pence >= 0);

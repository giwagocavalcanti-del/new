-- Delivery timeline: the parcel coming back to the depot after a failed
-- attempt, the date of the next attempt, and the customer confirming receipt.
-- Run after 0003. Safe to run once.

-- "back_at_depot": after a failed attempt the parcel is back at the carrier's
-- logistics centre and will go out again. Only from a real report (carrier or
-- staff), never assumed because the customer did not confirm.
alter table public.shipments drop constraint if exists shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status in (
    'pending', 'preparing', 'dispatched', 'in_transit', 'out_for_delivery',
    'delivered', 'delivery_attempted', 'back_at_depot', 'exception', 'returned', 'cancelled'
  ));

alter table public.shipment_events drop constraint if exists shipment_events_status_check;
alter table public.shipment_events add constraint shipment_events_status_check
  check (status in (
    'preparing', 'dispatched', 'in_transit', 'out_for_delivery',
    'delivered', 'delivery_attempted', 'back_at_depot', 'exception', 'returned', 'cancelled'
  ));

alter table public.shipments
  -- Next delivery attempt as reported by the carrier or entered by staff.
  -- Without it the tracking page shows its own forecast, marked as such.
  add column next_attempt_on date,
  -- When the customer confirmed on the tracking page that the parcel arrived.
  -- Ends the timeline. Set once; pressing the button again changes nothing.
  add column received_confirmed_at timestamptz;

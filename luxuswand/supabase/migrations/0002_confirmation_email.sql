-- When the order confirmation reached the email service. Empty means it still
-- has to be sent, which lets the retry route pick it up after a failure.

alter table public.orders add column confirmation_email_sent_at timestamptz;

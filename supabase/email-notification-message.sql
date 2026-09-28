-- Private message shown in status notification emails, editable from the artist panel.
alter table public.commission_orders
  add column if not exists artist_email_message text;

alter table public.commission_orders
  drop constraint if exists commission_orders_artist_email_message_length;

alter table public.commission_orders
  add constraint commission_orders_artist_email_message_length
  check (artist_email_message is null or char_length(artist_email_message) <= 500);

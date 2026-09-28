-- Private message shown in status notification emails, editable from the artist panel.
alter table public.commission_orders
  add column if not exists artist_email_message text;

alter table public.commission_orders
  drop constraint if exists commission_orders_artist_email_message_length;

alter table public.commission_orders
  add constraint commission_orders_artist_email_message_length
  check (artist_email_message is null or char_length(artist_email_message) <= 500);

-- Per-stage private messages and a private delivery history for artists.
alter table public.commission_orders
  add column if not exists artist_email_messages jsonb not null default '{}'::jsonb;

alter table public.commission_orders
  drop constraint if exists commission_orders_artist_email_messages_object;

alter table public.commission_orders
  add constraint commission_orders_artist_email_messages_object
  check (jsonb_typeof(artist_email_messages) = 'object');

create table if not exists public.commission_email_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commission_orders(id) on delete cascade,
  status text not null,
  sent boolean not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint commission_email_notifications_detail_length check (detail is null or char_length(detail) <= 500)
);

create index if not exists commission_email_notifications_order_created_idx
  on public.commission_email_notifications (order_id, created_at desc);

alter table public.commission_email_notifications enable row level security;
revoke all on public.commission_email_notifications from public, anon;
grant select, insert on public.commission_email_notifications to authenticated;

drop policy if exists "Assigned artists read email history" on public.commission_email_notifications;
create policy "Assigned artists read email history"
  on public.commission_email_notifications for select to authenticated
  using (public.can_access_commission_order(order_id));

drop policy if exists "Assigned artists add email history" on public.commission_email_notifications;
create policy "Assigned artists add email history"
  on public.commission_email_notifications for insert to authenticated
  with check (public.can_access_commission_order(order_id));

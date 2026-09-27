-- Execute uma vez no SQL Editor do Supabase para ativar acompanhamento público
-- por código e permitir que artistas autorizadas removam pedidos.

alter table public.commission_orders
    add column if not exists tracking_code text
    not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

create unique index if not exists commission_orders_tracking_code_key
    on public.commission_orders (tracking_code);

drop policy if exists "Artists delete orders" on public.commission_orders;
create policy "Artists delete orders"
on public.commission_orders for delete to authenticated
using ((select public.is_artist()));

grant delete on public.commission_orders to authenticated;

create or replace function public.get_public_order_status(lookup_code text)
returns table (art_type text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select orders.art_type, orders.status, orders.created_at
    from public.commission_orders as orders
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
    limit 1;
$$;

revoke all on function public.get_public_order_status(text) from public;
grant execute on function public.get_public_order_status(text) to anon, authenticated;

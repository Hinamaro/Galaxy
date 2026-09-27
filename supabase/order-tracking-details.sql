-- Execute no SQL Editor do Supabase para habilitar previsões de entrega
-- opcionais e mostrar a última atualização no acompanhamento público.

alter table public.commission_orders
    add column if not exists estimated_delivery date;

drop function if exists public.get_public_order_status(text);

create function public.get_public_order_status(lookup_code text)
returns table (
    art_type text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    estimated_delivery date
)
language sql
stable
security definer
set search_path = ''
as $$
    select orders.art_type, orders.status, orders.created_at,
           orders.updated_at, orders.estimated_delivery
    from public.commission_orders as orders
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
    limit 1;
$$;

revoke all on function public.get_public_order_status(text) from public;
grant execute on function public.get_public_order_status(text) to anon, authenticated;

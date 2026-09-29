-- Portal de encomendas: formulário público e entrega privada de arquivos.
-- Execute depois de setup.sql, studio-workflow-upgrades.sql e business-tools.sql.

alter table public.commission_orders
    add column if not exists client_email text,
    add column if not exists email_updates_enabled boolean not null default false,
    add column if not exists tracking_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

create unique index if not exists commission_orders_tracking_code_key
    on public.commission_orders(tracking_code);

create or replace function public.submit_public_commission_request(
    request_name text,
    request_contact text,
    request_email text,
    request_artist text,
    request_type text,
    request_summary text,
    request_reference text default '',
    request_email_consent boolean default false
)
returns table (tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
    new_order public.commission_orders%rowtype;
    normalized_email text := lower(trim(coalesce(request_email, '')));
begin
    if char_length(trim(coalesce(request_name, ''))) not between 1 and 120
       or char_length(trim(coalesce(request_contact, ''))) not between 2 and 180
       or char_length(trim(coalesce(request_artist, ''))) not between 1 and 80
       or char_length(trim(coalesce(request_type, ''))) not between 1 and 100
       or char_length(trim(coalesce(request_summary, ''))) not between 10 and 1200
       or char_length(trim(coalesce(request_reference, ''))) > 500
       or (normalized_email <> '' and normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') then
        raise exception 'Confira os campos do pedido e tente novamente.' using errcode = '22023';
    end if;
    if request_artist not in ('Ynnley', 'Bonny') then
        raise exception 'Escolha uma artista disponível.' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.commission_orders as recent
        where lower(recent.client_contact) = lower(trim(request_contact))
          and recent.created_at > now() - interval '2 minutes'
    ) then
        raise exception 'Um pedido recente já foi enviado. Aguarde um pouco antes de tentar novamente.' using errcode = '23505';
    end if;
    insert into public.commission_orders (
        client_name, client_contact, client_email, email_updates_enabled,
        art_type, summary, status, artist_name
    ) values (
        trim(request_name), trim(request_contact), nullif(normalized_email, ''),
        coalesce(request_email_consent, false) and normalized_email <> '',
        trim(request_type),
        trim(request_summary) || case when trim(coalesce(request_reference, '')) <> ''
            then E'\n\nReferência: ' || trim(request_reference) else '' end,
        'received', trim(request_artist)
    ) returning * into new_order;
    return query select new_order.tracking_code;
end;
$$;
revoke all on function public.submit_public_commission_request(text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.submit_public_commission_request(text,text,text,text,text,text,text,boolean) to anon, authenticated;

create table if not exists public.commission_deliveries (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.commission_orders(id) on delete cascade,
    file_path text not null unique,
    original_name text not null check (char_length(original_name) between 1 and 255),
    file_size bigint not null check (file_size > 0 and file_size <= 104857600),
    mime_type text not null default 'application/octet-stream',
    file_kind text not null check (file_kind in ('sketch','final','other')),
    note text not null default '' check (char_length(note) <= 500),
    client_visible boolean not null default true,
    created_by uuid not null default auth.uid() references auth.users(id),
    created_at timestamptz not null default now()
);
alter table public.commission_deliveries enable row level security;
revoke all on public.commission_deliveries from public, anon;
grant select, insert, update, delete on public.commission_deliveries to authenticated;
drop policy if exists "Artists manage assigned commission deliveries" on public.commission_deliveries;
create policy "Artists manage assigned commission deliveries" on public.commission_deliveries
    for all to authenticated using (public.can_access_commission_order(order_id))
    with check (public.can_access_commission_order(order_id) and created_by = (select auth.uid()));

-- Bucket privado: mantém 50 MiB para funcionar nos projetos Free.
-- Após mudar de plano/limite global, ajuste ambos para 104857600 (100 MiB).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('commission-deliveries', 'commission-deliveries', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null;

drop policy if exists "Artists access assigned private delivery files" on storage.objects;
create policy "Artists access assigned private delivery files" on storage.objects
    for all to authenticated using (
        bucket_id = 'commission-deliveries' and exists (
            select 1 from public.commission_orders as orders
            where orders.id::text = (storage.foldername(name))[1]
              and public.can_access_commission_order(orders.id)
        )
    ) with check (
        bucket_id = 'commission-deliveries' and exists (
            select 1 from public.commission_orders as orders
            where orders.id::text = (storage.foldername(name))[1]
              and public.can_access_commission_order(orders.id)
        )
    );

create or replace function public.get_public_order_deliveries(lookup_code text)
returns table (id uuid, original_name text, file_size bigint, mime_type text, file_kind text, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select deliveries.id, deliveries.original_name, deliveries.file_size,
           deliveries.mime_type, deliveries.file_kind, deliveries.note, deliveries.created_at
    from public.commission_orders as orders
    join public.commission_deliveries as deliveries on deliveries.order_id = orders.id
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
      and deliveries.client_visible is true
      and orders.status not in ('cancelled')
    order by deliveries.created_at desc;
$$;
revoke all on function public.get_public_order_deliveries(text) from public;
grant execute on function public.get_public_order_deliveries(text) to anon, authenticated;

create or replace function public.get_order_delivery_download(lookup_code text, delivery_id uuid)
returns table (file_path text, original_name text)
language sql stable security definer set search_path = '' as $$
    select deliveries.file_path, deliveries.original_name
    from public.commission_orders as orders
    join public.commission_deliveries as deliveries on deliveries.order_id = orders.id
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
      and deliveries.id = delivery_id
      and deliveries.client_visible is true
      and orders.status not in ('cancelled')
    limit 1;
$$;
revoke all on function public.get_order_delivery_download(text, uuid) from public;
grant execute on function public.get_order_delivery_download(text, uuid) to service_role;

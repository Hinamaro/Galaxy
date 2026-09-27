-- Novos recursos: organização por artista, histórico, solicitações do cliente,
-- publicação de trabalhos com autorização e consulta pública com histórico.
-- Execute depois de public-tracking-and-order-delete.sql e order-tracking-details.sql.

alter table public.commission_orders
    add column if not exists artist_name text not null default 'Sem atribuição';
alter table public.commission_orders
    add column if not exists estimated_delivery date;

create table if not exists public.commission_order_history (
    id bigint generated always as identity primary key,
    order_id uuid not null references public.commission_orders(id) on delete cascade,
    status text not null check (status in ('received','quote','payment','queue','sketch','approval','finalizing','delivered','cancelled')),
    changed_at timestamptz not null default now(),
    unique (order_id, status, changed_at)
);
alter table public.commission_order_history enable row level security;
revoke all on public.commission_order_history from public, anon;
grant select on public.commission_order_history to authenticated;
drop policy if exists "Artists read order history" on public.commission_order_history;
create policy "Artists read order history" on public.commission_order_history
    for select to authenticated using ((select public.is_artist()));

create or replace function public.record_commission_order_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        insert into public.commission_order_history(order_id, status, changed_at)
        values (new.id, new.status, new.created_at) on conflict do nothing;
    elsif old.status is distinct from new.status then
        insert into public.commission_order_history(order_id, status, changed_at)
        values (new.id, new.status, new.updated_at) on conflict do nothing;
    end if;
    return new;
end;
$$;
drop trigger if exists commission_order_history_on_insert on public.commission_orders;
create trigger commission_order_history_on_insert after insert on public.commission_orders
    for each row execute function public.record_commission_order_history();
drop trigger if exists commission_order_history_on_status_change on public.commission_orders;
create trigger commission_order_history_on_status_change after update of status on public.commission_orders
    for each row execute function public.record_commission_order_history();
insert into public.commission_order_history(order_id, status, changed_at)
select orders.id, orders.status, orders.created_at
from public.commission_orders as orders
where not exists (
    select 1 from public.commission_order_history as history
    where history.order_id = orders.id and history.status = orders.status
);

create table if not exists public.commission_client_requests (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.commission_orders(id) on delete cascade,
    request_type text not null check (request_type in ('revision','cancellation','question')),
    message text not null check (char_length(message) between 3 and 1000),
    state text not null default 'pending' check (state in ('pending','handled')),
    created_at timestamptz not null default now(),
    handled_at timestamptz
);
alter table public.commission_client_requests enable row level security;
revoke all on public.commission_client_requests from public, anon;
grant select, update on public.commission_client_requests to authenticated;
drop policy if exists "Artists read client requests" on public.commission_client_requests;
create policy "Artists read client requests" on public.commission_client_requests
    for select to authenticated using ((select public.is_artist()));
drop policy if exists "Artists update client requests" on public.commission_client_requests;
create policy "Artists update client requests" on public.commission_client_requests
    for update to authenticated using ((select public.is_artist())) with check ((select public.is_artist()));

create or replace function public.submit_public_order_request(lookup_code text, request_kind text, request_message text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_order uuid;
begin
    if coalesce(request_kind, '') not in ('revision','cancellation','question')
       or char_length(trim(coalesce(request_message, ''))) not between 3 and 1000
       or char_length(coalesce(lookup_code, '')) not between 1 and 64 then
        return false;
    end if;
    select orders.id into target_order
    from public.commission_orders as orders
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
    limit 1;
    if target_order is null then return false; end if;
    if exists (
        select 1 from public.commission_client_requests as requests
        where requests.order_id = target_order and requests.created_at > now() - interval '10 minutes'
    ) then return false; end if;
    insert into public.commission_client_requests(order_id, request_type, message)
    values (target_order, request_kind, trim(request_message));
    return true;
end;
$$;
revoke all on function public.submit_public_order_request(text, text, text) from public;
grant execute on function public.submit_public_order_request(text, text, text) to anon, authenticated;

create table if not exists public.commission_gallery (
    id uuid primary key default gen_random_uuid(),
    order_id uuid unique references public.commission_orders(id) on delete set null,
    title text not null check (char_length(title) between 1 and 120),
    category text not null default 'comissao' check (category in ('character','fanart','oc','illustration')),
    artist_name text not null,
    image_path text not null unique,
    consent_confirmed boolean not null check (consent_confirmed is true),
    published boolean not null default true,
    created_at timestamptz not null default now()
);
alter table public.commission_gallery enable row level security;
revoke all on public.commission_gallery from public, anon;
grant select on public.commission_gallery to anon, authenticated;
grant insert, update, delete on public.commission_gallery to authenticated;
drop policy if exists "Anyone can view approved commission gallery" on public.commission_gallery;
create policy "Anyone can view approved commission gallery" on public.commission_gallery
    for select to anon, authenticated using (published is true and consent_confirmed is true);
drop policy if exists "Artists read all commission gallery" on public.commission_gallery;
create policy "Artists read all commission gallery" on public.commission_gallery
    for select to authenticated using ((select public.is_artist()));
drop policy if exists "Artists add approved commission gallery" on public.commission_gallery;
create policy "Artists add approved commission gallery" on public.commission_gallery
    for insert to authenticated with check ((select public.is_artist()) and consent_confirmed is true);
drop policy if exists "Artists update commission gallery" on public.commission_gallery;
create policy "Artists update commission gallery" on public.commission_gallery
    for update to authenticated using ((select public.is_artist())) with check ((select public.is_artist()) and consent_confirmed is true);
drop policy if exists "Artists delete commission gallery" on public.commission_gallery;
create policy "Artists delete commission gallery" on public.commission_gallery
    for delete to authenticated using ((select public.is_artist()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('commission-gallery', 'commission-gallery', true, 8388608, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608,
    allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists "Public read approved commission artwork" on storage.objects;
create policy "Public read approved commission artwork" on storage.objects
    for select to anon, authenticated using (bucket_id = 'commission-gallery');
drop policy if exists "Artists upload commission artwork" on storage.objects;
create policy "Artists upload commission artwork" on storage.objects
    for insert to authenticated with check (bucket_id = 'commission-gallery' and (select public.is_artist()));
drop policy if exists "Artists update commission artwork" on storage.objects;
create policy "Artists update commission artwork" on storage.objects
    for update to authenticated using (bucket_id = 'commission-gallery' and (select public.is_artist()))
    with check (bucket_id = 'commission-gallery' and (select public.is_artist()));
drop policy if exists "Artists delete commission artwork" on storage.objects;
create policy "Artists delete commission artwork" on storage.objects
    for delete to authenticated using (bucket_id = 'commission-gallery' and (select public.is_artist()));

drop function if exists public.get_public_order_status(text);
create function public.get_public_order_status(lookup_code text)
returns table (
    art_type text, status text, created_at timestamptz, updated_at timestamptz,
    estimated_delivery date, history jsonb
)
language sql stable security definer set search_path = '' as $$
    select orders.art_type, orders.status, orders.created_at, orders.updated_at,
           orders.estimated_delivery,
           coalesce((
               select jsonb_agg(jsonb_build_object('status', history.status, 'changed_at', history.changed_at)
                                order by history.changed_at)
               from public.commission_order_history as history where history.order_id = orders.id
           ), '[]'::jsonb)
    from public.commission_orders as orders
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
    limit 1;
$$;
revoke all on function public.get_public_order_status(text) from public;
grant execute on function public.get_public_order_status(text) to anon, authenticated;

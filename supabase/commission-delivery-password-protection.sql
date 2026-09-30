-- Protege prévias e downloads das entregas com uma senha definida pela artista.
-- Execute depois de commission-delivery-and-intake.sql.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

alter table public.commission_deliveries
    add column if not exists password_required boolean not null default false;

create table if not exists private.commission_delivery_passwords (
    order_id uuid primary key references public.commission_orders(id) on delete cascade,
    password_hash text not null,
    failed_attempts integer not null default 0 check (failed_attempts >= 0),
    locked_until timestamptz,
    updated_at timestamptz not null default now()
);
alter table private.commission_delivery_passwords enable row level security;
revoke all on private.commission_delivery_passwords from public, anon, authenticated;

create or replace function public.set_commission_delivery_password(target_order uuid, new_password text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
    if target_order is null or not public.can_access_commission_order(target_order) then
        raise exception 'Você não tem acesso a este pedido.' using errcode = '42501';
    end if;
    if new_password is null or octet_length(new_password) < 8 or octet_length(new_password) > 72 then
        raise exception 'Use uma senha com pelo menos 8 caracteres e até 72 bytes.' using errcode = '22023';
    end if;

    insert into private.commission_delivery_passwords (order_id, password_hash, failed_attempts, locked_until, updated_at)
    values (target_order, extensions.crypt(new_password, extensions.gen_salt('bf', 12)), 0, null, now())
    on conflict (order_id) do update set
        password_hash = excluded.password_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();
end;
$$;
revoke all on function public.set_commission_delivery_password(uuid, text) from public, anon, authenticated;
grant execute on function public.set_commission_delivery_password(uuid, text) to authenticated;

create or replace function public.has_commission_delivery_password(target_order uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
    if target_order is null or not public.can_access_commission_order(target_order) then
        raise exception 'Você não tem acesso a este pedido.' using errcode = '42501';
    end if;
    return exists (
        select 1 from private.commission_delivery_passwords as passwords
        where passwords.order_id = target_order
    );
end;
$$;
revoke all on function public.has_commission_delivery_password(uuid) from public, anon, authenticated;
grant execute on function public.has_commission_delivery_password(uuid) to authenticated;

drop function if exists public.get_public_order_deliveries(text);
create function public.get_public_order_deliveries(lookup_code text)
returns table (
    id uuid, original_name text, file_size bigint, mime_type text,
    file_kind text, note text, created_at timestamptz, password_required boolean
)
language sql stable security definer set search_path = '' as $$
    select deliveries.id, deliveries.original_name, deliveries.file_size,
           deliveries.mime_type, deliveries.file_kind, deliveries.note,
           deliveries.created_at, deliveries.password_required
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

-- Remove the old service-role-only download path so it cannot bypass passwords.
revoke all on function public.get_order_delivery_download(text, uuid) from public, anon, authenticated, service_role;

create or replace function public.get_protected_order_delivery_download(
    lookup_code text, delivery_id uuid, delivery_password text default null
)
returns table (file_path text, original_name text)
language plpgsql security definer set search_path = '' as $$
declare
    matched_order uuid;
    matched_path text;
    matched_name text;
    needs_password boolean;
    stored_hash text;
    failed_count integer;
    lock_expiration timestamptz;
begin
    select orders.id, deliveries.file_path, deliveries.original_name, deliveries.password_required
      into matched_order, matched_path, matched_name, needs_password
    from public.commission_orders as orders
    join public.commission_deliveries as deliveries on deliveries.order_id = orders.id
    where orders.tracking_code = upper(regexp_replace(coalesce(lookup_code, ''), '[^A-Fa-f0-9]', '', 'g'))
      and char_length(coalesce(lookup_code, '')) between 1 and 64
      and deliveries.id = delivery_id
      and deliveries.client_visible is true
      and orders.status not in ('cancelled')
    limit 1;
    if matched_order is null then return; end if;

    if needs_password then
        select passwords.password_hash, passwords.failed_attempts, passwords.locked_until
          into stored_hash, failed_count, lock_expiration
        from private.commission_delivery_passwords as passwords
        where passwords.order_id = matched_order
        for update;
        if not found then return; end if;
        if lock_expiration is not null and lock_expiration > now() then return; end if;
        if lock_expiration is not null and lock_expiration <= now() then
            update private.commission_delivery_passwords
               set failed_attempts = 0, locked_until = null
             where order_id = matched_order;
            failed_count := 0;
        end if;

        if coalesce(delivery_password, '') = ''
           or extensions.crypt(delivery_password, stored_hash) <> stored_hash then
            failed_count := coalesce(failed_count, 0) + 1;
            update private.commission_delivery_passwords
               set failed_attempts = failed_count,
                   locked_until = case when failed_count >= 5 then now() + interval '15 minutes' else null end
             where order_id = matched_order;
            return;
        end if;
        update private.commission_delivery_passwords
           set failed_attempts = 0, locked_until = null
         where order_id = matched_order;
    end if;

    return query select matched_path, matched_name;
end;
$$;
revoke all on function public.get_protected_order_delivery_download(text, uuid, text) from public, anon, authenticated;
grant execute on function public.get_protected_order_delivery_download(text, uuid, text) to service_role;

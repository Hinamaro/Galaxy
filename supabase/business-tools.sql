-- Recursos administrativos: vínculo de contas a artistas, pagamentos e resumo financeiro.
-- Execute depois de studio-workflow-upgrades.sql.

alter table private.artist_access
    add column if not exists artist_name text,
    add column if not exists can_manage_all boolean not null default true;

alter table public.commission_orders
    add column if not exists client_email text,
    add column if not exists email_updates_enabled boolean not null default false,
    add column if not exists agreed_amount numeric(10,2)
        check (agreed_amount is null or agreed_amount >= 0);

create or replace function public.current_artist_name()
returns text language sql stable security definer set search_path = '' as $$
    select access.artist_name
    from private.artist_access as access
    where access.user_id = (select auth.uid())
    limit 1;
$$;
revoke all on function public.current_artist_name() from public, anon;
grant execute on function public.current_artist_name() to authenticated;

create or replace function public.can_manage_all_commissions()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from private.artist_access as access
        where access.user_id = (select auth.uid()) and access.can_manage_all is true
    );
$$;
revoke all on function public.can_manage_all_commissions() from public, anon;
grant execute on function public.can_manage_all_commissions() to authenticated;

create or replace function public.can_access_commission_order(target_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select (select public.is_artist()) and (
        (select public.can_manage_all_commissions()) or exists (
            select 1 from public.commission_orders as orders
            where orders.id = target_order
              and orders.artist_name = (select public.current_artist_name())
        )
    );
$$;
revoke all on function public.can_access_commission_order(uuid) from public, anon;
grant execute on function public.can_access_commission_order(uuid) to authenticated;

-- Replace all earlier permissive policies so artist assignments are enforced.
do $$
declare policy_row record;
begin
    for policy_row in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'commission_orders'
    loop
        execute format('drop policy if exists %I on public.commission_orders', policy_row.policyname);
    end loop;
end;
$$;
create policy "Artists read assigned orders" on public.commission_orders
    for select to authenticated using (public.can_access_commission_order(id));
create policy "Artists add assigned orders" on public.commission_orders
    for insert to authenticated with check (
        (select public.is_artist()) and (
            (select public.can_manage_all_commissions())
            or artist_name = (select public.current_artist_name())
        )
    );
create policy "Artists update assigned orders" on public.commission_orders
    for update to authenticated using (public.can_access_commission_order(id))
    with check (
        (select public.is_artist()) and (
            (select public.can_manage_all_commissions())
            or artist_name = (select public.current_artist_name())
        )
    );
create policy "Artists delete assigned orders" on public.commission_orders
    for delete to authenticated using (public.can_access_commission_order(id));
grant select, insert, update, delete on public.commission_orders to authenticated;

drop policy if exists "Artists read order history" on public.commission_order_history;
create policy "Artists read assigned order history" on public.commission_order_history
    for select to authenticated using (public.can_access_commission_order(order_id));

drop policy if exists "Artists read client requests" on public.commission_client_requests;
create policy "Artists read assigned client requests" on public.commission_client_requests
    for select to authenticated using (public.can_access_commission_order(order_id));
drop policy if exists "Artists update client requests" on public.commission_client_requests;
create policy "Artists update assigned client requests" on public.commission_client_requests
    for update to authenticated using (public.can_access_commission_order(order_id))
    with check (public.can_access_commission_order(order_id));

create table if not exists public.commission_payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.commission_orders(id) on delete cascade,
    amount numeric(10,2) not null check (amount > 0),
    paid_at date not null default current_date,
    payment_method text not null default 'Não informado'
        check (char_length(payment_method) between 1 and 60),
    note text not null default '' check (char_length(note) <= 300),
    created_at timestamptz not null default now()
);
alter table public.commission_payments enable row level security;
revoke all on public.commission_payments from public, anon;
grant select, insert, update, delete on public.commission_payments to authenticated;
drop policy if exists "Artists read assigned payments" on public.commission_payments;
create policy "Artists read assigned payments" on public.commission_payments
    for select to authenticated using (public.can_access_commission_order(order_id));
drop policy if exists "Artists add assigned payments" on public.commission_payments;
create policy "Artists add assigned payments" on public.commission_payments
    for insert to authenticated with check (public.can_access_commission_order(order_id));
drop policy if exists "Artists update assigned payments" on public.commission_payments;
create policy "Artists update assigned payments" on public.commission_payments
    for update to authenticated using (public.can_access_commission_order(order_id))
    with check (public.can_access_commission_order(order_id));
drop policy if exists "Artists delete assigned payments" on public.commission_payments;
create policy "Artists delete assigned payments" on public.commission_payments
    for delete to authenticated using (public.can_access_commission_order(order_id));

create or replace function public.touch_commission_order_from_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'DELETE' then
        update public.commission_orders set updated_at = now() where id = old.order_id;
        return old;
    end if;
    update public.commission_orders set updated_at = now()
    where id = new.order_id;
    return new;
end;
$$;
revoke all on function public.touch_commission_order_from_payment() from public, anon, authenticated;
drop trigger if exists commission_payment_touches_order on public.commission_payments;
create trigger commission_payment_touches_order
after insert or update or delete on public.commission_payments
for each row execute function public.touch_commission_order_from_payment();

-- A disponibilidade continua compartilhada; cada conta de artista cuida das comissões atribuídas.

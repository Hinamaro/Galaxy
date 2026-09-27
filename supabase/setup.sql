-- Execute no SQL Editor do projeto Supabase antes de publicar o site.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.artist_access (
    user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.artist_access enable row level security;
revoke all on private.artist_access from public, anon, authenticated;

create or replace function public.is_artist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.artist_access as access_list
        where access_list.user_id = (select auth.uid())
    );
$$;
revoke all on function public.is_artist() from public, anon;
grant execute on function public.is_artist() to authenticated;

create table if not exists public.commission_status (
    id integer primary key check (id = 1),
    state text not null default 'closed' check (state in ('open', 'few', 'closed')),
    slots_left integer not null default 0 check (slots_left between 0 and 99),
    public_note text not null default '' check (char_length(public_note) <= 180),
    updated_at timestamptz not null default now()
);
insert into public.commission_status (id, state, slots_left, public_note)
values (1, 'closed', 0, '')
on conflict (id) do nothing;

create table if not exists public.commission_orders (
    id uuid primary key default gen_random_uuid(),
    client_name text not null check (char_length(client_name) between 1 and 120),
    client_contact text not null check (char_length(client_contact) between 1 and 180),
    art_type text not null check (char_length(art_type) between 1 and 100),
    summary text not null check (char_length(summary) between 1 and 1200),
    status text not null default 'received' check (status in (
        'received', 'quote', 'payment', 'queue', 'sketch',
        'approval', 'finalizing', 'delivered', 'cancelled'
    )),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists commission_status_updated_at on public.commission_status;
create trigger commission_status_updated_at
before update on public.commission_status
for each row execute function public.set_updated_at();

drop trigger if exists commission_orders_updated_at on public.commission_orders;
create trigger commission_orders_updated_at
before update on public.commission_orders
for each row execute function public.set_updated_at();

alter table public.commission_status enable row level security;
alter table public.commission_orders enable row level security;

drop policy if exists "Anyone can read public commission availability" on public.commission_status;
create policy "Anyone can read public commission availability"
on public.commission_status for select to anon, authenticated
using (true);

drop policy if exists "Artists update availability with MFA" on public.commission_status;
create policy "Artists update availability with MFA"
on public.commission_status for update to authenticated
using ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2')
with check ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2');

drop policy if exists "Artists read orders with MFA" on public.commission_orders;
create policy "Artists read orders with MFA"
on public.commission_orders for select to authenticated
using ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2');

drop policy if exists "Artists add orders with MFA" on public.commission_orders;
create policy "Artists add orders with MFA"
on public.commission_orders for insert to authenticated
with check ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2');

drop policy if exists "Artists update orders with MFA" on public.commission_orders;
create policy "Artists update orders with MFA"
on public.commission_orders for update to authenticated
using ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2')
with check ((select public.is_artist()) and (select auth.jwt()->>'aal') = 'aal2');

grant select on public.commission_status to anon, authenticated;
grant update on public.commission_status to authenticated;
grant select, insert, update on public.commission_orders to authenticated;

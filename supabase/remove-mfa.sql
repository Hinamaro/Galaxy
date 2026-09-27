-- Migração aplicada no projeto Supabase do portal em 2026-09-27.
-- Mantém o acesso restrito às contas autorizadas, sem exigir MFA.
-- Após esta mudança, contas listadas em private.artist_access acessam pedidos
-- usando somente e-mail e senha. Execute apenas após confirmar essa redução.

-- Remover as versões anteriores e as regras substitutas, para permitir reexecução.
drop policy if exists "Artists update availability" on public.commission_status;
drop policy if exists "Artists read orders" on public.commission_orders;
drop policy if exists "Artists add orders" on public.commission_orders;
drop policy if exists "Artists update orders" on public.commission_orders;
drop policy if exists "Artists update availability with MFA" on public.commission_status;
drop policy if exists "Artists read orders with MFA" on public.commission_orders;
drop policy if exists "Artists add orders with MFA" on public.commission_orders;
drop policy if exists "Artists update orders with MFA" on public.commission_orders;

-- Continuar exigindo conta autorizada, mas sem exigir aal2.
create policy "Artists update availability"
on public.commission_status for update to authenticated
using ((select public.is_artist()))
with check ((select public.is_artist()));

create policy "Artists read orders"
on public.commission_orders for select to authenticated
using ((select public.is_artist()));

create policy "Artists add orders"
on public.commission_orders for insert to authenticated
with check ((select public.is_artist()));

create policy "Artists update orders"
on public.commission_orders for update to authenticated
using ((select public.is_artist()))
with check ((select public.is_artist()));



-- Run this in the Supabase SQL editor.
-- It stores one private cloud-sync row per authenticated user.

create table if not exists public.coin_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  watchlist jsonb not null default '[]'::jsonb,
  encrypted_api_token text,
  updated_at timestamptz not null default now()
);

alter table public.coin_user_data enable row level security;

alter table public.coin_user_data
  alter column user_id set default auth.uid();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.coin_user_data to authenticated;

drop policy if exists "coin_user_data_select_own" on public.coin_user_data;
drop policy if exists "coin_user_data_insert_own" on public.coin_user_data;
drop policy if exists "coin_user_data_update_own" on public.coin_user_data;
drop policy if exists "coin_user_data_delete_own" on public.coin_user_data;

create policy "coin_user_data_select_own"
  on public.coin_user_data
  for select
  using (auth.uid() = user_id);

create policy "coin_user_data_insert_own"
  on public.coin_user_data
  for insert
  with check (auth.uid() = user_id);

create policy "coin_user_data_update_own"
  on public.coin_user_data
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "coin_user_data_delete_own"
  on public.coin_user_data
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_coin_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coin_user_data_set_updated_at on public.coin_user_data;

create trigger coin_user_data_set_updated_at
  before update on public.coin_user_data
  for each row
  execute function public.set_coin_user_data_updated_at();

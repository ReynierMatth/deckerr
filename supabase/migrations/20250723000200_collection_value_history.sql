/*
  # Daily snapshot of collection value (for the value-over-time chart)
*/
create table if not exists public.collection_value_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null default current_date,
  value numeric not null default 0,
  created_at timestamptz default now(),
  unique (user_id, snapshot_date)
);

alter table public.collection_value_history enable row level security;

drop policy if exists "Users can view their own value history" on public.collection_value_history;
create policy "Users can view their own value history"
  on public.collection_value_history for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can write their own value history" on public.collection_value_history;
create policy "Users can write their own value history"
  on public.collection_value_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

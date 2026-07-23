/*
  # Wishlists — cards a user wants (prereq for trade suggestions)
*/
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  created_at timestamptz default now(),
  unique (user_id, card_id)
);

alter table public.wishlists enable row level security;

drop policy if exists "Users can view their own wishlist" on public.wishlists;
create policy "Users can view their own wishlist"
  on public.wishlists for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can manage their own wishlist" on public.wishlists;
create policy "Users can manage their own wishlist"
  on public.wishlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

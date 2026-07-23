/*
  # Wishlist quantity + priority

  Adds how many copies the user wants and how badly they want them.
  Existing rows default to 1 copy at medium priority.
*/
alter table public.wishlists
  add column if not exists quantity integer not null default 1;

alter table public.wishlists
  add column if not exists priority text not null default 'medium';

alter table public.wishlists
  drop constraint if exists wishlists_priority_check;

alter table public.wishlists
  add constraint wishlists_priority_check
  check (priority in ('high', 'medium', 'low'));

alter table public.wishlists
  drop constraint if exists wishlists_quantity_check;

alter table public.wishlists
  add constraint wishlists_quantity_check
  check (quantity >= 1);

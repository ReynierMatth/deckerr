/*
  # Discord-style identity: freeform display_name + unique @handle

  - display_name: shown name, freeform, NOT unique (can duplicate).
  - handle: stable @identity, unique, lowercase [a-z0-9_], 3-20 chars.

  Existing `username` is kept (still read by the currently-deployed image) and
  the trigger keeps it in sync, so old and new frontends coexist during rollout.
  For future federation the global identity is @handle@instance.tld.
*/

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists handle text;

-- One-off backfill helper: a unique handle from a base string.
create or replace function public.deckerr_unique_handle(base text)
returns text
language plpgsql
as $$
declare
  slug text;
  candidate text;
  n int := 0;
begin
  slug := regexp_replace(lower(coalesce(base, '')), '[^a-z0-9_]', '', 'g');
  if length(slug) < 3 then slug := 'player'; end if;
  slug := left(slug, 20);
  candidate := slug;
  while exists (select 1 from public.profiles where handle = candidate) loop
    n := n + 1;
    candidate := left(slug, 15) || n::text;
  end loop;
  return candidate;
end;
$$;

-- Backfill existing rows from their old username.
update public.profiles
  set display_name = coalesce(display_name, username, 'Player')
  where display_name is null;

do $$
declare r record;
begin
  for r in select id, username from public.profiles where handle is null loop
    update public.profiles
      set handle = public.deckerr_unique_handle(coalesce(r.username, 'player'))
      where id = r.id;
  end loop;
end $$;

-- Enforce uniqueness + format going forward.
create unique index if not exists profiles_handle_key on public.profiles (handle);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_handle_format') then
    alter table public.profiles
      add constraint profiles_handle_format
      check (handle is null or handle ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;

-- Sign-up: assign a unique handle + display_name from the email local part, and
-- keep username in sync for the currently-deployed frontend.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  new_handle text;
begin
  base := split_part(coalesce(new.email, ''), '@', 1);
  new_handle := public.deckerr_unique_handle(base);
  insert into public.profiles (id, handle, display_name, username)
  values (new.id, new_handle, coalesce(nullif(base, ''), new_handle), new_handle)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/*
  # Fix new-user handling

  The `handle_new_user` trigger function and its `on_auth_user_created` trigger
  were never captured in migrations (they lived only in the live DB and pointed
  at a legacy `public.users` table that no migration creates). This makes a
  fresh, migration-only rebuild create a profile row on sign-up instead — the
  table the app actually reads.
*/

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

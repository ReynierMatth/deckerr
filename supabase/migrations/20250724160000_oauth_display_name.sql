/*
  # Nicer defaults for OAuth sign-ups

  When a user signs up via Google/Discord, Supabase fills raw_user_meta_data
  with their name/username. Use it for display_name (and to seed the handle),
  falling back to the email local part for email/password sign-ups. Handle stays
  unique + generated so no one is ever 'Unknown'.
*/

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  disp text;
  base text;
  new_handle text;
begin
  disp := coalesce(
    nullif(meta->>'full_name', ''),
    nullif(meta->>'name', ''),
    nullif(meta->>'preferred_username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );
  base := coalesce(
    nullif(meta->>'preferred_username', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    disp,
    'player'
  );
  new_handle := public.deckerr_unique_handle(base);

  insert into public.profiles (id, handle, display_name, username)
  values (new.id, new_handle, coalesce(disp, new_handle), new_handle)
  on conflict (id) do nothing;
  return new;
end;
$$;

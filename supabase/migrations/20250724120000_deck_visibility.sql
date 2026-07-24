/*
  # 3-level deck visibility

  private  — owner only
  unlisted — anyone with the link (incl. anonymous), NOT listed in Discover
  public   — link + listed in Discover

  `is_public` is kept in sync as (visibility != 'private') so the existing
  link/anon SELECT policies need no change — they already gate on is_public,
  which now means "link-accessible" (unlisted OR public). Only the Discover
  query narrows to visibility = 'public'.
*/

alter table public.decks
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'decks_visibility_check'
  ) then
    alter table public.decks
      add constraint decks_visibility_check
      check (visibility in ('private', 'unlisted', 'public'));
  end if;
end $$;

-- Backfill from the existing boolean.
update public.decks set visibility = 'public' where is_public = true and visibility <> 'public';

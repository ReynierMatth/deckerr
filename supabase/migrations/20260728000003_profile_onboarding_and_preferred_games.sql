/*
  # Onboarding + preferred games

  After signing up, a user confirms their profile and picks the TCGs they care
  about; the app then only surfaces those games' per-game UI.

  - preferred_games: the games the user selected (empty = all enabled games).
  - onboarded_at: when they finished onboarding (null = show the flow).
*/

alter table public.profiles add column if not exists preferred_games text[] not null default '{}';
alter table public.profiles add column if not exists onboarded_at timestamptz;

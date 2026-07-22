/*
  # In-app notifications (friend requests, trades) via DB triggers
*/
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade, -- recipient
  type text not null,          -- friend_request | friend_accepted | trade_new | trade_update
  title text not null,
  body text,
  related_id uuid,
  read boolean not null default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Recipients read their notifications" on public.notifications;
create policy "Recipients read their notifications"
  on public.notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "Recipients update their notifications" on public.notifications;
create policy "Recipients update their notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Recipients delete their notifications" on public.notifications;
create policy "Recipients delete their notifications"
  on public.notifications for delete to authenticated using (user_id = auth.uid());
-- inserts happen only via the SECURITY DEFINER triggers below.

-- ---- friendship notifications ----
create or replace function public.notify_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT' and new.status = 'pending') then
    insert into public.notifications (user_id, type, title, related_id)
    values (new.addressee_id, 'friend_request', 'New friend request', new.id);
  elsif (TG_OP = 'UPDATE' and new.status = 'accepted' and old.status = 'pending') then
    insert into public.notifications (user_id, type, title, related_id)
    values (new.requester_id, 'friend_accepted', 'Friend request accepted', new.id);
  end if;
  return new;
end; $$;

drop trigger if exists notify_friendship_trg on public.friendships;
create trigger notify_friendship_trg
  after insert or update on public.friendships
  for each row execute function public.notify_friendship();

-- ---- trade notifications ----
create or replace function public.notify_trade()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient uuid;
begin
  if (TG_OP = 'INSERT') then
    insert into public.notifications (user_id, type, title, related_id)
    values (new.user2_id, 'trade_new', 'New trade offer', new.id);
  elsif (TG_OP = 'UPDATE') then
    -- notify the participant who didn't make the change
    v_recipient := case when new.editor_id = new.user1_id then new.user2_id else new.user1_id end;
    if (new.status is distinct from old.status) or (new.version is distinct from old.version) then
      insert into public.notifications (user_id, type, title, related_id)
      values (v_recipient, 'trade_update', 'A trade was updated', new.id);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists notify_trade_trg on public.trades;
create trigger notify_trade_trg
  after insert or update on public.trades
  for each row execute function public.notify_trade();

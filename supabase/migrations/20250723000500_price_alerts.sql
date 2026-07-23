/*
  # Price alerts — notify when a watched card crosses a threshold.
  Firing is done by check_price_alerts() (SECURITY DEFINER), called by the
  client at price-refresh time with the current prices it fetched from Scryfall.
*/
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  card_name text,
  target_price numeric not null,
  direction text not null check (direction in ('above', 'below')),
  last_triggered_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, card_id, direction)
);

alter table public.price_alerts enable row level security;

drop policy if exists "Users manage their own price alerts" on public.price_alerts;
create policy "Users manage their own price alerts"
  on public.price_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Compares the caller's alerts against a {card_id: price} json map; for any
-- alert whose threshold is crossed (and not already triggered today), creates a
-- notification and stamps last_triggered_at. Returns the number fired.
create or replace function public.check_price_alerts(prices jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_price numeric;
  v_crossed boolean;
  v_count integer := 0;
begin
  for a in select * from public.price_alerts where user_id = auth.uid() loop
    if (prices ? a.card_id) then
      v_price := (prices ->> a.card_id)::numeric;
      v_crossed := (a.direction = 'above' and v_price >= a.target_price)
                or (a.direction = 'below' and v_price <= a.target_price);
      if v_crossed and (a.last_triggered_at is null or a.last_triggered_at < now() - interval '20 hours') then
        insert into public.notifications (user_id, type, title, body, related_id)
        values (a.user_id, 'price_alert',
                coalesce(a.card_name, 'A card') || ' hit $' || v_price,
                'Your price alert (' || a.direction || ' $' || a.target_price || ') triggered.',
                a.id);
        update public.price_alerts set last_triggered_at = now() where id = a.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end; $$;

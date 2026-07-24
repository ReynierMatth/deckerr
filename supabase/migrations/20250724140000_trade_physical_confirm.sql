/*
  # Physical-first trades: per-side confirmation

  Trades are executed in person (hand to hand). The app just tracks it: each
  participant independently confirms "I did the exchange", which updates ONLY
  their own collection (remove what they gave, add what they received). No
  atomic dual-write, no trust problem — and it's federation-ready (each side
  only ever touches its own DB).

  - user1_confirmed / user2_confirmed: per-side "done IRL" flags.
  - status gains 'completed' (both sides confirmed).
  - confirm_trade(): applies the confirming user's collection changes + flips
    their flag; sets status='completed' once both have confirmed. Idempotent.
  Counter-offers are locked once anyone has confirmed (enforced app-side), so a
  confirmation never applies against stale terms.
*/

alter table public.trades add column if not exists user1_confirmed boolean not null default false;
alter table public.trades add column if not exists user2_confirmed boolean not null default false;

alter table public.trades drop constraint if exists trades_status_check;
alter table public.trades add constraint trades_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed'));

create or replace function public.confirm_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trades%rowtype;
  uid uuid := auth.uid();
  is_user1 boolean;
  already boolean;
  item record;
begin
  select * into t from public.trades where id = p_trade_id;
  if not found then raise exception 'Trade not found'; end if;
  if uid is null or (uid <> t.user1_id and uid <> t.user2_id) then
    raise exception 'Not a participant of this trade';
  end if;
  if t.status in ('declined', 'cancelled') then
    raise exception 'Trade is closed';
  end if;

  is_user1 := (uid = t.user1_id);
  already := case when is_user1 then t.user1_confirmed else t.user2_confirmed end;
  if already then return; end if; -- idempotent

  -- Cards this user GIVES (they own them in the trade): remove from their
  -- collection, clamped — if they no longer have enough, remove what's there.
  for item in
    select card_id, quantity from public.trade_items
    where trade_id = p_trade_id and owner_id = uid
  loop
    update public.collections
      set quantity = quantity - item.quantity, updated_at = now()
      where user_id = uid and card_id = item.card_id;
    delete from public.collections
      where user_id = uid and card_id = item.card_id and quantity <= 0;
  end loop;

  -- Cards this user RECEIVES (owned by the other side): add to their collection.
  for item in
    select card_id, quantity from public.trade_items
    where trade_id = p_trade_id and owner_id <> uid
  loop
    insert into public.collections (user_id, card_id, quantity)
      values (uid, item.card_id, item.quantity)
      on conflict (user_id, card_id)
      do update set quantity = public.collections.quantity + excluded.quantity, updated_at = now();
  end loop;

  -- Flip this side's confirmation; complete once both sides have confirmed.
  if is_user1 then
    update public.trades
      set user1_confirmed = true,
          status = case when user2_confirmed then 'completed' else status end,
          updated_at = now()
      where id = p_trade_id;
  else
    update public.trades
      set user2_confirmed = true,
          status = case when user1_confirmed then 'completed' else status end,
          updated_at = now()
      where id = p_trade_id;
  end if;
end;
$$;

grant execute on function public.confirm_trade(uuid) to authenticated;

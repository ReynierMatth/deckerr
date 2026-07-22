/*
  # Align trades schema with the app code

  The app (tradesService.ts, TradeDetail.tsx, TradesTab.tsx) uses
  `user1_id`/`user2_id` and embeds `profiles!trades_user1_id_fkey` /
  `trades_user2_id_fkey`, but earlier migrations created `sender_id`/
  `receiver_id`. Rename the columns + FK constraints and rewrite execute_trade
  accordingly. Guarded so it's a no-op on an already-aligned DB.

  Mapping: user1_id = trade initiator, user2_id = browsed-collection owner
  (the party who accepts).
*/

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='trades' and column_name='sender_id') then
    alter table public.trades rename column sender_id to user1_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='trades' and column_name='receiver_id') then
    alter table public.trades rename column receiver_id to user2_id;
  end if;
  if exists (select 1 from pg_constraint where conname='trades_sender_id_fkey') then
    alter table public.trades rename constraint trades_sender_id_fkey to trades_user1_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname='trades_receiver_id_fkey') then
    alter table public.trades rename constraint trades_receiver_id_fkey to trades_user2_id_fkey;
  end if;
end $$;

create or replace function public.execute_trade(trade_id uuid)
returns boolean
language plpgsql
security definer
as $function$
declare
  v_trade RECORD;
  v_item RECORD;
begin
  select * into v_trade from public.trades where id = trade_id;
  if v_trade is null or v_trade.status != 'pending' then
    return false;
  end if;
  if v_trade.user2_id != auth.uid() then
    return false;
  end if;

  for v_item in select * from public.trade_items where trade_items.trade_id = execute_trade.trade_id
  loop
    declare
      v_new_owner uuid;
    begin
      if v_item.owner_id = v_trade.user1_id then
        v_new_owner := v_trade.user2_id;
      else
        v_new_owner := v_trade.user1_id;
      end if;

      update public.collections
      set quantity = quantity - v_item.quantity, updated_at = now()
      where user_id = v_item.owner_id and card_id = v_item.card_id;

      delete from public.collections
      where user_id = v_item.owner_id and card_id = v_item.card_id and quantity <= 0;

      insert into public.collections (user_id, card_id, quantity)
      values (v_new_owner, v_item.card_id, v_item.quantity)
      on conflict (user_id, card_id)
      do update set quantity = collections.quantity + v_item.quantity, updated_at = now();
    end;
  end loop;

  update public.trades set status = 'accepted', updated_at = now() where id = trade_id;
  return true;
end;
$function$;

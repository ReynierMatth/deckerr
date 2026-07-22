/*
  # Allow both trade participants to edit a pending trade's items

  Counter-offers are made by either party, but the trade_items INSERT/DELETE
  policies only allowed user1_id (the initiator), so a counter-offer by user2
  failed with 42501 (and the DELETE silently removed nothing). Broaden both to
  either participant while the trade is still pending.
*/

drop policy if exists "Users can add trade items" on public.trade_items;
create policy "Users can add trade items"
  on public.trade_items for insert to authenticated
  with check (exists (
    select 1 from public.trades t
    where t.id = trade_items.trade_id
      and (t.user1_id = auth.uid() or t.user2_id = auth.uid())
      and t.status = 'pending'
  ));

drop policy if exists "Users can delete their trade items" on public.trade_items;
create policy "Users can delete their trade items"
  on public.trade_items for delete to authenticated
  using (exists (
    select 1 from public.trades t
    where t.id = trade_items.trade_id
      and (t.user1_id = auth.uid() or t.user2_id = auth.uid())
      and t.status = 'pending'
  ));

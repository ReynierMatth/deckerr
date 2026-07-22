/*
  # RLS policies the app needs but that were never versioned

  - profiles INSERT: ProfileSettings/AuthContext upsert the profile; an
    INSERT ... ON CONFLICT is checked against the INSERT policy, which was
    missing (only SELECT + UPDATE existed) -> 42501 on save.
  - trade_items DELETE: editing a trade (updateTrade) deletes its items before
    reinserting; no DELETE policy existed.
*/

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can delete their trade items" on public.trade_items;
create policy "Users can delete their trade items"
  on public.trade_items for delete to authenticated
  using (exists (
    select 1 from public.trades
    where trades.id = trade_items.trade_id
      and trades.user1_id = auth.uid()
      and trades.status = 'pending'
  ));

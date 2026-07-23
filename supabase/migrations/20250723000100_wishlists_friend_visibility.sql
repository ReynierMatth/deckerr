/*
  # Let accepted friends view each other's wishlists (for trade suggestions)
*/
drop policy if exists "Friends can view wishlists" on public.wishlists;
create policy "Friends can view wishlists"
  on public.wishlists for select to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = wishlists.user_id) or
          (f.addressee_id = auth.uid() and f.requester_id = wishlists.user_id)
        )
    )
  );

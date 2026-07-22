/*
  # Maintain profiles.collection_total_value

  Keeps the denormalized collection value in sync with
  sum(collections.price_usd * quantity) per user, via a trigger on collections.
  (price_usd itself is a per-card snapshot; a periodic price refresh keeps it
  current — see follow-up.)
*/

create or replace function public.recalc_collection_total_value(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p
  set collection_total_value = coalesce(
    (select sum(coalesce(c.price_usd, 0) * coalesce(c.quantity, 0))
       from public.collections c where c.user_id = p_user_id), 0)
  where p.id = p_user_id;
end;
$$;

create or replace function public.trg_collection_total_value()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'DELETE') then
    perform public.recalc_collection_total_value(old.user_id);
    return old;
  end if;
  perform public.recalc_collection_total_value(new.user_id);
  if (TG_OP = 'UPDATE' and old.user_id <> new.user_id) then
    perform public.recalc_collection_total_value(old.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists collection_total_value_trg on public.collections;
create trigger collection_total_value_trg
  after insert or update or delete on public.collections
  for each row execute function public.trg_collection_total_value();

# refresh-prices (daily cron)

Refreshes Scryfall prices for every collection card and writes a per-user
`collection_value_history` snapshot. It needs the **service_role** key, so it
runs server-side as a Supabase Edge Function — not from the app.

## Deploy

```bash
# one-time
supabase login
supabase link --project-ref <your-project-ref>

# deploy the function
supabase functions deploy refresh-prices
```

The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase
injects automatically for deployed functions.

## Schedule it daily

In the Supabase dashboard: **Database → Cron** (pg_cron) → new job, e.g. every
day at 06:00 UTC, calling the function over HTTP via `pg_net`:

```sql
select cron.schedule(
  'refresh-prices-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url    := 'https://<your-project-ref>.supabase.co/functions/v1/refresh-prices',
    headers:= jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
```

(Or use the dashboard's **Edge Functions → Schedules** UI if available.)

Once scheduled, the collection value chart fills a point per day automatically —
the in-app manual "Refresh prices" button and the once-a-day-on-open refresh
remain as complements.

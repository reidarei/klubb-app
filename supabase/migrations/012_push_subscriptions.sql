-- Push-subscriptions for web push-varsler
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid references profiles(id) on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  opprettet timestamptz default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

alter table push_subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'Les egne push-subscriptions') then
    create policy "Les egne push-subscriptions" on push_subscriptions
      for select using (profil_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'Legg til push-subscription') then
    create policy "Legg til push-subscription" on push_subscriptions
      for insert with check (profil_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'Slett egne push-subscriptions') then
    create policy "Slett egne push-subscriptions" on push_subscriptions
      for delete using (profil_id = auth.uid());
  end if;
end $$;

-- Logg for å unngå duplikatvarsler
create table if not exists varsler_logg (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid references arrangementer(id) on delete cascade not null,
  type text not null,
  sendt_at timestamptz default now(),
  constraint varsler_logg_unik unique (arrangement_id, type)
);

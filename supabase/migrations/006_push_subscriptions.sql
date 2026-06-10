create table push_subscriptions (
  id        uuid primary key default gen_random_uuid(),
  profil_id uuid not null references profiles(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  opprettet timestamptz not null default now()
);

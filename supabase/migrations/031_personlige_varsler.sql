create table personlige_varsler (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid references profiles(id) on delete cascade not null,
  tittel text not null,
  melding text not null,
  lest boolean not null default false,
  opprettet timestamptz default now()
);

alter table personlige_varsler enable row level security;

create policy "Les egne varsler"
  on personlige_varsler for select
  using (profil_id = auth.uid());

create policy "Oppdater egne varsler"
  on personlige_varsler for update
  using (profil_id = auth.uid());

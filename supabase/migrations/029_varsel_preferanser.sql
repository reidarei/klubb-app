-- Per-bruker varselpreferanser: push og e-post av/på
create table varsel_preferanser (
  profil_id uuid primary key references profiles(id) on delete cascade,
  push_aktiv boolean not null default false,
  epost_aktiv boolean not null default true,
  oppdatert timestamptz default now()
);

alter table varsel_preferanser enable row level security;

create policy "Les egne varselpreferanser"
  on varsel_preferanser for select
  using (profil_id = auth.uid());

create policy "Sett inn egne varselpreferanser"
  on varsel_preferanser for insert
  with check (profil_id = auth.uid());

create policy "Oppdater egne varselpreferanser"
  on varsel_preferanser for update
  using (profil_id = auth.uid());

-- Seed: opprett rad for alle eksisterende profiler (default true/true)
insert into varsel_preferanser (profil_id)
select id from profiles
on conflict do nothing;

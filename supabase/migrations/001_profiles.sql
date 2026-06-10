-- profiles: utvider auth.users med app-spesifikke felter
create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  navn      text not null,
  epost     text not null,
  telefon   text,
  bilde_url text,
  rolle     text not null default 'medlem' check (rolle in ('admin', 'medlem')),
  aktiv     boolean not null default true,
  opprettet timestamptz not null default now(),
  oppdatert timestamptz not null default now()
);

-- Trigger: opprett profiles-rad automatisk når ny auth.users-rad opprettes
create or replace function handle_ny_bruker()
returns trigger as $$
begin
  insert into public.profiles (id, epost)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger ved_ny_bruker
  after insert on auth.users
  for each row execute procedure handle_ny_bruker();

-- Trigger: opprett varsel_preferanser-rad automatisk ved ny profil.
--
-- Bakgrunn (issue #294): nye brukere opprettet via init-admin-script,
-- admin-UI eller manuell SQL fikk ikke varsel_preferanser-rad automatisk.
-- Mangelen ble oppdaget fordi push-varsler (029) bruker .eq('profil_id', …)
-- og feiler stille når raden mangler. Triggerløsningen lukker problemklassen
-- for alle nåværende og fremtidige inn-veier — i stedet for å patche per sted.
--
-- varsel_preferanser-skjema (029 + 030):
--   profil_id uuid PRIMARY KEY  → ON CONFLICT (profil_id) er trygt
--   push_aktiv boolean NOT NULL DEFAULT false
--   epost_aktiv boolean NOT NULL DEFAULT true
--   oppdatert timestamptz DEFAULT now()
-- Alle kolonner har default; minimal insert med bare profil_id er nok.

create or replace function opprett_varsel_preferanser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into varsel_preferanser (profil_id)
  values (new.id)
  on conflict (profil_id) do nothing;
  return new;
end;
$$;

-- Trigger på profiles (handle_ny_bruker håndterer auth.users → profiles;
-- denne triggeren tar seg av profiles → varsel_preferanser).
drop trigger if exists ved_ny_profil_varsel_preferanser on public.profiles;
create trigger ved_ny_profil_varsel_preferanser
  after insert on public.profiles
  for each row
  execute function opprett_varsel_preferanser();

-- Idempotent backfill: opprett rad for alle eksisterende profiler som mangler.
-- ON CONFLICT sikrer at eksisterende rader ikke påvirkes.
insert into varsel_preferanser (profil_id)
select id from profiles
on conflict (profil_id) do nothing;

-- Gjør generalsekretær til en ekte rolle (ikke bare flagg).
--
-- Roller (fra nå av): 'medlem', 'admin', 'generalsekretaer'.
-- Alle har medlem-rettigheter. Admin + generalsekretær har i tillegg
-- admin-rettigheter. Rettighets-matrisen speiles i `lib/roller.ts` — denne
-- migrasjonen gjør tilsvarende tilpasninger på database-nivå (constraint,
-- er_admin()-funksjon, RLS-policies).

-- 1) Bytt rolle-CHECK til å godta 'generalsekretaer'
alter table profiles drop constraint if exists profiles_rolle_check;
alter table profiles
  add constraint profiles_rolle_check
  check (rolle in ('admin', 'medlem', 'generalsekretaer'));

-- 2) Kildeklubben promoterte sittende generalsekretær her (data-setning,
--    strøket i publisert versjon — en fersk database har ingen profiler ennå).
--    Sett selv ved behov: update profiles set rolle = 'generalsekretaer' where navn = '…';

-- 3) Fjern det midlertidige boolean-flagget
alter table profiles drop column if exists generalsekretaer;

-- 4) Utvid er_admin() — generalsekretær har admin-rettigheter i RLS
create or replace function er_admin()
returns boolean
language sql
security definer
as $$
  select rolle in ('admin', 'generalsekretaer') from profiles where id = auth.uid()
$$;

-- 5) Oppdater hardkodede RLS-policies (der `rolle = 'admin'` er inlinet).
--    Vi bruker er_admin() slik at generalsekretær også får tilgang.

-- arrangement_kommentarer ble droppet i migrasjon 020, så ingen policy der.

drop policy if exists "Slette egne eller admin" on arrangement_chat;
create policy "Slette egne eller admin" on arrangement_chat
  for delete using (profil_id = auth.uid() or er_admin());

drop policy if exists "Slette egne eller admin" on klubb_chat;
create policy "Slette egne eller admin" on klubb_chat
  for delete using (profil_id = auth.uid() or er_admin());

drop policy if exists "Admin leser alle varsler" on varsel_logg;
create policy "Admin leser alle varsler" on varsel_logg
  for select using (er_admin());

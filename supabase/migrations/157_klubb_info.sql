-- Klubbens stiftelsesdato, sted og «Om klubben»-tekst, redigerbare fra
-- kontrollpanelet (/innstillinger/om-klubben).
--
-- Én rad (id er alltid true). Mangler raden, eller er en kolonne null, gjelder
-- defaulten fra lib/klubb-config.ts (env-styrt) — tabellen er tom på en fersk
-- instans, og det er normaltilstanden.
--
-- om_tekst lagrer avsnittene skilt med en blank linje. Tegnegrensene speiler
-- KLUBB_STED_MAKS / KLUBB_OM_MAKS i lib/konstanter.ts.
create table public.klubb_info (
  id boolean primary key default true check (id),
  stiftet date,
  sted text check (char_length(btrim(sted)) between 1 and 60),
  om_tekst text check (char_length(btrim(om_tekst)) between 1 and 2000),
  oppdatert timestamptz not null default now()
);

alter table public.klubb_info enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt).
-- Ingen anon (jf. #412-auditen). Ingen delete — raden ryddes ved å lagre verdier.
grant select, insert, update on public.klubb_info to authenticated;
grant select, insert, update, delete on public.klubb_info to service_role;

-- Alle innloggede leser: Klubb-siden og agendaen (jubileet) viser verdiene.
create policy "Innloggede kan lese klubbinfo"
  on public.klubb_info for select
  to authenticated
  using (true);

create policy "Admin kan sette inn klubbinfo"
  on public.klubb_info for insert
  to authenticated
  with check (er_admin());

create policy "Admin kan endre klubbinfo"
  on public.klubb_info for update
  to authenticated
  using (er_admin())
  with check (er_admin());

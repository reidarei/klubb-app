-- Generelle på/av-funksjonsflagg for appen (#447)
--
-- Nøkkel/verdi-tabell der admin kan skru funksjoner av og på sentralt.
-- Alle innloggede kan lese; skriving er gatet til er_admin() via RLS.

create table public.app_innstillinger (
  noekkel     text        primary key,
  aktiv       boolean     not null default false,
  beskrivelse text,
  oppdatert   timestamptz not null default now()
);

alter table public.app_innstillinger enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på eksisterende prosjekter, jf. migrasjonspolicy)
-- IKKE grant til anon — ingen offentlige flater.
grant select             on public.app_innstillinger to authenticated;
grant insert, update     on public.app_innstillinger to authenticated;
grant select, insert, update, delete on public.app_innstillinger to service_role;

create policy "Innloggede kan lese app_innstillinger"
  on public.app_innstillinger for select
  using (auth.role() = 'authenticated');

create policy "Admin kan sette inn app_innstillinger"
  on public.app_innstillinger for insert
  with check (er_admin());

create policy "Admin kan endre app_innstillinger"
  on public.app_innstillinger for update
  using (er_admin());

-- Seed: fond_fane er av som default — nøytral for template-speiling.
-- false betyr at Fond-fanen kun er synlig for admin inntil bryteren skrus på.
insert into public.app_innstillinger (noekkel, aktiv, beskrivelse)
values ('fond_fane', false, 'Vis Fond-fanen for alle medlemmer');

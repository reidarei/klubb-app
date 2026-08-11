-- Fond: kobling mellom navn i oppgjøret og medlem i appen (#571)
--
-- Oppgjøret fra fond-API-et identifiserer innskytere med et NAVN. Appen slår
-- det opp mot profiles.visningsnavn. Det gjør en presentasjonsverdi til
-- primærnøkkel over en systemgrense: bytter et medlem kallenavn i appen,
-- slutter oppgjøret å matche, og hele importen blokkeres av ett navn.
--
-- Denne tabellen er oversettelseslaget. Når et navn i oppgjøret ikke finnes
-- som visningsnavn, kan admin peke ut riktig person én gang, og valget står.
-- Den håndterer også historiske navn — et medlem som sto med kallenavn i
-- fjorårets ark og fullt navn i år matcher fortsatt, uten at noen må
-- redigere regnearket.
--
-- api_navn er primærnøkkel: ett navn i oppgjøret kan bare peke på én person.
-- Motsatt vei er åpen — samme person kan ha flere gamle navn.

create table public.fond_navn_alias (
  api_navn text primary key,
  profil_id uuid not null references public.profiles(id) on delete cascade,
  opprettet timestamptz not null default now(),
  opprettet_av uuid not null references public.profiles(id)
);

-- Oppslag går andre veien når vi viser hvilke alias en person har.
create index fond_navn_alias_profil_idx on public.fond_navn_alias (profil_id);

alter table public.fond_navn_alias enable row level security;

-- Data API-tilgang (jf. Policy: Migrasjoner).
-- IKKE anon: ingen offentlige flater.
grant select, insert, update, delete on public.fond_navn_alias to authenticated;
grant select, insert, update, delete on public.fond_navn_alias to service_role;

-- Alle innloggede kan lese — fondssiden er allerede synlig for medlemmer når
-- fond-bryteren er på, og et alias avslører ikke mer enn navnelista gjør.
create policy "Alle innloggede kan lese navnealias"
  on public.fond_navn_alias for select
  to authenticated
  using (true);

-- Kun admin kan koble. Feil kobling sender en andel til feil person, så dette
-- er en pengeoperasjon i praksis — ikke en preferanse.
create policy "Admin kan opprette navnealias"
  on public.fond_navn_alias for insert
  to authenticated
  with check (er_admin());

create policy "Admin kan endre navnealias"
  on public.fond_navn_alias for update
  to authenticated
  using (er_admin())
  with check (er_admin());

create policy "Admin kan slette navnealias"
  on public.fond_navn_alias for delete
  to authenticated
  using (er_admin());

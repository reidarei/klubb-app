-- #491 (rotårsak til #312): /tidligere leser meldinger fra DB-en sortert på
-- sist_aktivitet, men viser dem sortert på arkivert_tidspunkt ?? sist_aktivitet.
-- Lesing og visning var to uavhengige uttrykk for samme regel — en permutasjon
-- av hverandre, ikke identiske — så keyset-cursoren kunne hoppe over rader:
-- en arkivert melding kan ligge langt bak i sist_aktivitet-rekkefølgen (og
-- dermed være lest på en senere side), men langt fremme i den viste
-- rekkefølgen (og dermed forventes på en tidligere side).
--
-- Fiksen er en generert kolonne: DB-en eier invarianten «arkivert_tidspunkt
-- hvis satt, ellers sist_aktivitet», så .order(), keyset-filteret, sortIso
-- og cursoren i app/(app)/tidligere/page.tsx alle leser samme verdi fra
-- samme kilde. En trigger som skriver et vanlig felt kunne i prinsippet
-- glemmes på en fremtidig skrivevei (ny INSERT-sti, bulk-import, etc.) —
-- en generated column kan ikke det, den regnes ut av Postgres selv.
--
-- Dette er prosjektets FØRSTE generated column.
--
-- `not null` er eksplisitt selv om uttrykket aldri KAN gi null (sist_aktivitet
-- er not null, mig. 054): Postgres utleder ikke nullability av et coalesce-
-- uttrykk, så uten denne constrainten står kolonnen nullable i katalogen og
-- Supabase-typegeneratoren gir `string | null` — som forplanter seg til
-- unødvendige null-sjekker og caster i app/(app)/tidligere/page.tsx.
alter table public.meldinger
  add column if not exists sorterings_tidspunkt timestamptz not null
  generated always as (coalesce(arkivert_tidspunkt, sist_aktivitet)) stored;

-- Read-only via PostgREST: et UPDATE-forsøk mot kolonnen feiler med
-- Postgres-feilkode 428C9 («cannot insert/update generated column»).
-- Nyere typegen (postgres-meta) merker generated columns som `?: never` i
-- Insert-/Update-typene — det er tilsiktet og skal ikke «rettes tilbake» til
-- en skrivbar type. Eldre generatorer lister dem som vanlige kolonner; ikke
-- skriv til kolonnen fra klient- eller server-kode uansett hva typene sier.
create index if not exists meldinger_sorterings_paginering_idx
  on public.meldinger (sorterings_tidspunkt desc, id desc);

-- Ingen ny GRANT: tabellnivå-grants fra mig. 107 (grants_minste_privilegium)
-- dekker alle kolonner på tabellen, også nye — pg_attribute.attacl for
-- meldinger er tom (ingen kolonne-spesifikke ACL-er), så en ny kolonne arver
-- tabellens grant uten videre. Samme begrunnelse som mig. 099.
--
-- meldinger_sist_aktivitet_idx beholdes uendret — agendaens
-- .gte('sist_aktivitet', …)-spørring (forsiden) bruker den fortsatt og har
-- ingen sammenheng med denne kolonnen.
--
-- meldinger_tidligere_paginering_idx har derimot ingen leser lenger etter at
-- /tidligere byttet keyset til sorterings_tidspunkt. Den droppes likevel ikke:
-- tabellen er på ~85 rader, så vedlikeholdskostnaden er neglisjerbar, og den
-- er billig forsikring hvis en fremtidig spørring igjen vil keyset-paginere på
-- (sist_aktivitet desc, id desc).

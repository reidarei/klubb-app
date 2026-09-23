-- #416 — Steng anon-default privileges i public-schema (rotårsak etter #412).
--
-- Bakgrunn: Migrasjon 107 (#412) ryddet grants på alle 32 eksisterende tabeller,
-- men Supabase har default privileges på public-schema som gir GRANT ALL til anon
-- for hvert nytt objekt som opprettes. Uten denne migrasjonen ville neste nye
-- tabell automatisk arve anon-tilgang igjen. Her stenges rotårsaken.
--
-- Hvem treffer ALTER DEFAULT PRIVILEGES?
--   Uten FOR ROLE-klausul gjelder endringen gjeldende rolle = postgres. Det er
--   rollen som kjører migrasjoner og eier alle objekter i public-schema — den
--   eneste oppføringen som er relevant for oss. Supabase-plattformens
--   supabase_admin-oppføring er en plattform-artefakt; postgres er ikke medlem
--   av supabase_admin-rollen, så den kan ikke endres herfra og er uansett
--   irrelevant fordi supabase_admin aldri oppretter våre tabeller.
--
-- Tabeller, sekvenser OG funksjoner:
--   Alle tre objekttyper stenges fordi rotårsaken er den samme. anon EXECUTE på
--   fremtidige SECURITY DEFINER-funksjoner er potensielt verre enn tabell-grants
--   — en function kan eskalere privilegier på tvers av RLS.
--
-- Hva røres IKKE:
--   authenticated røres bevisst ikke. Over-grant til authenticated er backstoppet
--   av RLS, og å fjerne authenticated-default ville tvunget hver fremtidig
--   migrasjon til å huske eksplisitt grant — ellers 42501. Supabase fjerner
--   uansett alle default-grants automatisk 2026-10-30.
--
-- Effekt på eksisterende tabeller:
--   Ingen. ALTER DEFAULT PRIVILEGES gjelder kun fremtidige objekter. Eksisterende
--   tabeller er allerede ryddet i migrasjon 107. Denne migrasjonen kan ikke
--   brekke noen nåværende flate.
--
-- Reversering (om nødvendig):
--   alter default privileges in schema public grant all on tables    to anon;
--   alter default privileges in schema public grant all on sequences to anon;
--   alter default privileges in schema public grant all on functions to anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

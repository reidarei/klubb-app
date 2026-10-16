-- Multi-tenant steg 1.1 (#861 / #864): tabellen `klubb`.
--
-- Første rad er «den klubben appen er i dag», og den opprettes likt på alle
-- instanser. uuid-en er fast med vilje: den brukes i 1.2 til å backfille
-- `klubb_id` på eksisterende tabeller, i e2e (e2e/helpers/klubb.ts) og i
-- isolasjonstester. Navnet er nøytralt fordi fila deles byte for byte med et
-- offentlig repo; den enkelte instansen setter riktig navn og slug etterpå
-- med et engangssteg (docs/drift.md § 4).
--
-- Det finnes bevisst ingen skrivepolicy for authenticated: klubber opprettes
-- først i 5.3 (#884), og da via service_role. Lesepolicyen er bred nå
-- (alle innloggede) og strammes inn til egen klubb i 2.3 (#870).

create table public.klubb (
  id uuid primary key default gen_random_uuid(),
  -- Reserverte slugs (www, api, app) sperres først i 5.1 (#882).
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  -- Tegngrensen får en konstant i lib/konstanter.ts når 3.2 (#874) gjør feltet redigerbart.
  navn text not null check (char_length(btrim(navn)) between 1 and 60),
  opprettet timestamptz not null default now()
);

alter table public.klubb enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30)
-- IKKE grant til anon: vi har ingen offentlige flater (jf. #412-auditen).
--
-- REVOKE MÅ KOMME FØR GRANT: migrasjon 108 skrudde av default privileges kun
-- for anon, så authenticated arver GRANT ALL på en ny tabell. `grant select`
-- alene trekker ikke tilbake insert/update/delete (samme felle som 147).
-- Vaktet av __tests__/migrasjon-klubb-grants.test.ts og e2e/rls/klubb.spec.ts.
revoke all on public.klubb from authenticated;
grant select on public.klubb to authenticated;
grant select, insert, update, delete on public.klubb to service_role;

create policy "Innloggede kan lese klubber" on public.klubb
  for select to authenticated using (true);

insert into public.klubb (id, slug, navn)
  values ('00000000-0000-4000-a000-000000000001', 'klubb', 'Klubben');

-- Multi-tenant 1.2 (#861, #865): klubb_id på klubbeide tabeller.
--
-- Hver rad i en klubbeid tabell får en fremmednøkkel til public.klubb. Kolonnen
-- er `not null default public.standard_klubb_id()`: eksisterende rader og alle
-- inserts som ikke oppgir klubb_id havner i den første klubben, så ingen
-- app-kode eller policy trenger å endres i dette steget.
--
-- Klassifisering av de 53 tabellene i public:
--   klubbeide (46)  får klubb_id, se alter table-setningene under
--   unntak (7)      får IKKE klubb_id:
--     klubb               roten selv.
--     profiles            personen er global; rolle og faar_* flyttes til
--                         medlemskap i 2.1 (#868).
--     push_subscriptions  per enhet: samme telefon skal få varsler fra alle
--                         klubbene en mann er med i.
--     pass_info           passet tilhører personen; klubbkonteksten bor i
--                         pass_tilgang_forespørsel.
--     varsel_preferanser  tilhører medlemskapet, PK byttes i 2.1 (#868).
--     posisjon_deling     tilhører medlemskapet, PK byttes i 2.1 (#868).
--     posisjon_punkt      arrangement_id er nullable, så raden har ingen sann
--                         klubb før medlemskap finnes i 2.1 (#868).
--
-- standard_klubb_id() er en MIDLERTIDIG fallback. Innmaten byttes til
-- JWT-claim uten fallback i 2.4b (#896).
--
-- Ingen nøkler endres her: primær- og unike nøkler (inkl. én-rad-tabellene
-- klubb_info og fond_kontant) flyttes i 1.4 (#867). Barne-indekser venter på
-- 2.1b (#895); her lages bare 10 rot-indekser.
--
-- Vaktes av __tests__/migrasjon-klubb-id.test.ts (statisk), psql-steget
-- «Verifiser klubb_id på klubbeide tabeller» i .github/workflows/pr-check.yml
-- (skjema og data etter seed) og e2e/rls/klubb-id.spec.ts.

-- Supabase CLI kjører fila i én implisitt transaksjon (pipelining). Postgres
-- svarer da med WARNING 25P01 «SET LOCAL can only be used in transaction
-- blocks», men grensen gjelder likevel for resten av fila og lekker ikke til
-- sesjonen — bevist på test-instansen med en kopi som feilet med vilje (PR #897).
set local lock_timeout = '3s';

create function public.standard_klubb_id() returns uuid
  language sql stable set search_path = ''
  as $$ select '00000000-0000-4000-a000-000000000001'::uuid $$;

-- En default evalueres med privilegiene til rollen som setter inn, så
-- authenticated trenger execute. anon har ingen innsettingsflater.
revoke execute on function public.standard_klubb_id() from public, anon;
grant execute on function public.standard_klubb_id() to authenticated, service_role;

alter table public.aktivitet_dag add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.aktivitet_uke add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.album add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.album_bilde add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.album_bilde_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.album_bilde_reaksjon add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.app_innstillinger add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.arrangement_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.arrangementer add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.arrangementmaler add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.arrangoransvar add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.bursdagsbilde add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.chat_reaksjoner add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.feil_logg add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_bevegelse add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_eiendom add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_innskudd add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_kontant add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_navn_alias add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_verdi_historikk add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.fond_verdipapir add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.innspill_kobling add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.kaaring_vinnere add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.kaaringmaler add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.kart_markering add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.kart_symbol_tilpasning add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.klubb_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.klubb_info add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.melding_bilder add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.melding_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.melding_reaksjon add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.meldinger add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.paameldinger add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.pass_tilgang_forespørsel add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.poll add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.poll_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.poll_stemme add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.poll_valg add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.samtale add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.samtale_chat add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.timeplan_post add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.varsel_innstillinger add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.varsel_logg add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.vedtekter add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.vedtekter_versjoner add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;
alter table public.vitals_logg add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict;

-- Rot-indekser (klubb_id først)
create index arrangementer_klubb_id_start_tidspunkt_idx on public.arrangementer (klubb_id, start_tidspunkt);
create index meldinger_klubb_id_sist_aktivitet_idx on public.meldinger (klubb_id, sist_aktivitet desc);
create index klubb_chat_klubb_id_opprettet_idx on public.klubb_chat (klubb_id, opprettet desc, id desc);
create index album_klubb_id_opprettet_idx on public.album (klubb_id, opprettet desc);
create index poll_klubb_id_svarfrist_idx on public.poll (klubb_id, svarfrist);
create index feil_logg_klubb_id_opprettet_idx on public.feil_logg (klubb_id, opprettet desc);
create index vitals_logg_klubb_id_opprettet_idx on public.vitals_logg (klubb_id, opprettet desc);
create index kaaring_vinnere_klubb_id_aar_idx on public.kaaring_vinnere (klubb_id, aar);
create index arrangoransvar_klubb_id_aar_idx on public.arrangoransvar (klubb_id, aar);
create index kart_markering_klubb_id_utloper_idx on public.kart_markering (klubb_id, utloper);

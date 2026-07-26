-- Seed for lokal/selvhostet TEST-instans (#386).
-- Kjøres automatisk av `supabase db reset` (jf. [db.seed] i config.toml).
-- Kjøres ALDRI mot sky-prosjektet: `supabase db push` kjører kun migrasjoner,
-- aldri seed — denne fila treffer bare lokale instanser startet med CLI-en.
--
-- Innholdet er fiktivt: tre testmedlemmer og to fremtidige arrangementer,
-- nok til at e2e-suiten (golden-path, poll-flytene) har noe å jobbe mot.

-- ─── Testbrukere i auth ──────────────────────────────────────────────────────
-- Passord hashes med bcrypt slik GoTrue forventer. handle_ny_bruker-triggeren
-- (mig. 001/071/097) oppretter profiles-radene automatisk; vi oppdaterer dem
-- med ordentlige navn/roller etterpå.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- Token-kolonnene MÅ være tom streng, ikke NULL — GoTrue scanner dem som
  -- string ved innlogging og feiler på NULL (kjent felle ved manuell seed).
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'e2e-admin@klubb.test',
    extensions.crypt('e2e-lokal-hemmelighet', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'petter.prove@klubb.test',
    extensions.crypt('e2e-lokal-hemmelighet', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'ola.testesen@klubb.test',
    extensions.crypt('e2e-lokal-hemmelighet', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '',
    '', '', '', ''
  );

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@klubb.test';

-- ─── Profiler ────────────────────────────────────────────────────────────────
-- Triggeren har allerede laget radene — gi dem navn, roller og bursdager.

update public.profiles set
  navn = 'E2E Admin', visningsnavn = 'E2E Admin', rolle = 'admin',
  fodselsdato = '1980-03-15'
where id = '00000000-0000-4000-8000-000000000001';

update public.profiles set
  navn = 'Petter Prøve', visningsnavn = 'Petter', rolle = 'medlem',
  fodselsdato = '1985-07-20'
where id = '00000000-0000-4000-8000-000000000002';

update public.profiles set
  navn = 'Ola Testesen', visningsnavn = 'Ola', rolle = 'medlem',
  fodselsdato = '1990-11-05'
where id = '00000000-0000-4000-8000-000000000003';

-- ─── Arrangementer ───────────────────────────────────────────────────────────
-- Golden-path trenger minst ett KOMMENDE arrangement på agendaen. Relative
-- datoer (now() + interval) så seeden aldri «går ut på dato».

insert into public.arrangementer (id, type, tittel, beskrivelse, start_tidspunkt, oppmoetested, opprettet_av)
values
  (
    '00000000-0000-4000-9000-000000000001',
    'moete', 'Testmøte i klubben',
    'Seedet arrangement for e2e-testing — fremtidig møte.',
    now() + interval '14 days', 'Testlokalet',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '00000000-0000-4000-9000-000000000002',
    'tur', 'Testtur til fjells',
    'Seedet arrangement for e2e-testing — fremtidig tur.',
    now() + interval '45 days', 'Parkeringa',
    '00000000-0000-4000-8000-000000000001'
  );

-- Litt påmeldings-data så deltakerlister/RSVP-visninger har innhold.
insert into public.paameldinger (arrangement_id, profil_id, status)
values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000002', 'ja'),
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000003', 'kanskje');

-- Kommentarer — KommentarerPaaKort viser toggle-header kun når kortet har
-- kommentarer (visTall > 0), og e2e/kommentarer-i-kort.spec.ts forventer
-- synlig kommentar-seksjon på agendaen. Må ligge på arrangement 1: kun
-- toppkortet (HighlightKort) rendrer kommentar-seksjonen. golden-path
-- håndterer kollisjonen ved å klikke kortets øvre hjørne (kommentar-
-- seksjonen stopper klikk-propagering med vilje).
insert into public.arrangement_chat (arrangement_id, profil_id, innhold)
values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000002', 'Gleder meg, dette blir bra!'),
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000003', 'Kommer rett fra jobb, kan bli et kvarter forsinka.');

-- ─── Fortidsdata for /tidligere-specen (#489) ──────────────────────────────
-- Bulken under ligger bevisst MER enn AGENDA_VINDU_MND (12) måneder tilbake
-- (dagoffset 400+), slik at forsidens «Tidligere»-seksjon (subMonts-cutoff i
-- app/(app)/page.tsx) IKKE plukker dem opp — de skal kun være nåbare via
-- den paginerte /tidligere-siden. Fire enkelt-rader (én per type, «nylig
-- fortid») legges bevisst INNENFOR 12-månedersvinduet, slik at forsidens
-- «Tidligere»-seksjon også har noe å vise i test-instansen.
--
-- Tallene 34 møter / 6 turer / 5 meldinger / 4 poller (49 totalt) er BUNDET
-- til e2e/tidligere.spec.ts (ANT_MOETE/ANT_TUR/ANT_MELDING/ANT_POLL/
-- ANT_ALLE) — endres ett tall her må speccen oppdateres i samme commit.
-- 49 > TIDLIGERE_SIDESTOERRELSE (30) med vilje: paginering («Last mer»)
-- testes ikke ordentlig med bare et par rader (issuet foreslo opprinnelig
-- «et par», men det dekker ikke paginering — se Reidars avklaring i #489).
--
-- Deterministiske UUID-er: '00000000-0000-4000-<type>-<løpenummer>', der
-- <type> er 9100=møter, 9200=turer, 9300=meldinger, 9400=poller,
-- 9500=poll_valg. Løpenummer 0 = den «nylige» raden, 1..N = dyp historikk.
--
-- Hvert type har sitt eget dag-offset og steg (400+i*7 / 405+i*40 /
-- 410+i*30 / 415+i*50) — IKKE bare pynt: det garanterer at ingen to
-- elementer på tvers av typer får identisk sortIso, så merge-rekkefølgen i
-- app/(app)/tidligere/page.tsx (synkende på sortIso, id) er deterministisk
-- og aldri faller tilbake på id-tiebreak mellom typer.

-- === Møter (34: 1 nylig + 33 dyp historikk) ================================
insert into public.arrangementer (id, type, tittel, beskrivelse, start_tidspunkt, oppmoetested, opprettet_av)
values (
  '00000000-0000-4000-9100-000000000000',
  'moete', 'Historisk møte 00',
  'Seedet fortidsdata for /tidligere (#489) — nylig fortid, innenfor 12-månedersvinduet.',
  now() - interval '30 days', 'Klubbhuset',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.arrangementer (id, type, tittel, beskrivelse, start_tidspunkt, oppmoetested, opprettet_av)
select
  ('00000000-0000-4000-9100-' || lpad(i::text, 12, '0'))::uuid,
  'moete',
  'Historisk møte ' || lpad(i::text, 2, '0'),
  'Seedet fortidsdata for /tidligere (#489) — dyp historikk.',
  now() - make_interval(days => 400 + i * 7) + interval '1 hour',
  'Klubbhuset',
  ('00000000-0000-4000-8000-00000000000' || ((i % 3) + 1))::uuid
from generate_series(1, 33) as i;

-- === Turer (6: 1 nylig + 5 dyp historikk) ===================================
insert into public.arrangementer (id, type, tittel, beskrivelse, start_tidspunkt, oppmoetested, opprettet_av)
values (
  '00000000-0000-4000-9200-000000000000',
  'tur', 'Historisk tur 00',
  'Seedet fortidsdata for /tidligere (#489) — nylig fortid, innenfor 12-månedersvinduet.',
  now() - interval '60 days', 'Parkeringa',
  '00000000-0000-4000-8000-000000000002'
);

insert into public.arrangementer (id, type, tittel, beskrivelse, start_tidspunkt, oppmoetested, opprettet_av)
select
  ('00000000-0000-4000-9200-' || lpad(i::text, 12, '0'))::uuid,
  'tur',
  'Historisk tur ' || lpad(i::text, 2, '0'),
  'Seedet fortidsdata for /tidligere (#489) — dyp historikk.',
  now() - make_interval(days => 405 + i * 40) + interval '2 hours',
  'Parkeringa',
  ('00000000-0000-4000-8000-00000000000' || ((i % 3) + 1))::uuid
from generate_series(1, 5) as i;

-- === Meldinger (5: 1 nylig + 4 dyp historikk) ===============================
-- arkivert_tidspunkt og aktuell_dato holdes null (default) — ingen av
-- speccens forventninger avhenger av arkiv- eller festedato-oppførsel.
insert into public.meldinger (id, profil_id, innhold, opprettet, sist_aktivitet)
values (
  '00000000-0000-4000-9300-000000000000',
  '00000000-0000-4000-8000-000000000003',
  'Historisk innlegg 00 — seedet fortidsdata for /tidligere (#489).',
  now() - interval '40 days', now() - interval '40 days'
);

insert into public.meldinger (id, profil_id, innhold, opprettet, sist_aktivitet)
select
  ('00000000-0000-4000-9300-' || lpad(i::text, 12, '0'))::uuid,
  ('00000000-0000-4000-8000-00000000000' || ((i % 3) + 1))::uuid,
  'Historisk innlegg ' || lpad(i::text, 2, '0') || ' — seedet fortidsdata for /tidligere (#489).',
  now() - make_interval(days => 410 + i * 30) + interval '3 hours',
  now() - make_interval(days => 410 + i * 30) + interval '3 hours'
from generate_series(1, 4) as i;

-- === Poller (4: 1 nylig + 3 dyp historikk) ==================================
-- kaaring_mal_id holdes null (default) — dette er vanlige polls, ikke
-- kåringspoller, så /tidligere sin RPC-aggregat-gren (kaaringAggregater)
-- ikke trengs for at speccen skal kunne telle kort.
insert into public.poll (id, spoersmaal, svarfrist, opprettet_av)
values (
  '00000000-0000-4000-9400-000000000000',
  'Historisk poll 00?',
  now() - interval '20 days',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.poll (id, spoersmaal, svarfrist, opprettet_av)
select
  ('00000000-0000-4000-9400-' || lpad(i::text, 12, '0'))::uuid,
  'Historisk poll ' || lpad(i::text, 2, '0') || '?',
  now() - make_interval(days => 415 + i * 50) + interval '4 hours',
  ('00000000-0000-4000-8000-00000000000' || ((i % 3) + 1))::uuid
from generate_series(1, 3) as i;

-- To valg (Ja/Nei) per poll. poll_valg-id-en er utledet fra pollens eget
-- løpenummer (0=nylig, 1..3=dyp) ganget med 2 + valg-indeks — deterministisk
-- og unik uten å stole på innsettingsrekkefølge. Ingen poll_stemme seedes.
insert into public.poll_valg (id, poll_id, tekst, rekkefoelge)
select
  ('00000000-0000-4000-9500-' || lpad((i * 2 + v.idx)::text, 12, '0'))::uuid,
  ('00000000-0000-4000-9400-' || lpad(i::text, 12, '0'))::uuid,
  v.tekst,
  v.idx
from generate_series(0, 3) as i
cross join (values ('Ja', 0), ('Nei', 1)) as v(tekst, idx);

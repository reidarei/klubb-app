-- Seed for lokal/selvhostet TEST-instans (#386).
-- Kjøres automatisk av `supabase db reset` (jf. [db.seed] i config.toml).
-- Kjøres ALDRI mot sky-prosjektet: `supabase db push` kjører kun migrasjoner,
-- aldri seed — denne fila treffer bare lokale instanser startet med CLI-en.
--
-- Innholdet er fiktivt: fire testmedlemmer (inkl. én generalsekretær, #533)
-- og to fremtidige arrangementer, nok til at e2e-suiten (golden-path,
-- poll-flytene, RLS-suiten) har noe å jobbe mot.

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
  ),
  (
    -- Fjerde testbruker — generalsekretær (#533). RLS-testene trenger en ekte
    -- innlogget bruker med denne rollen for å bevise at er_admin() dekker
    -- BEGGE admin-rollene, ikke bare 'admin' (se e2e/rls/admin-grense.spec.ts).
    -- Ingen av de tre andre brukerne kan dekke det: rolle settes under, ikke
    -- her — triggeren gir alle nye auth.users-rader rolle='medlem' først.
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated',
    'gunnar.general@klubb.test',
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

update public.profiles set
  navn = 'Gunnar General', visningsnavn = 'Gunnar', rolle = 'generalsekretaer',
  fodselsdato = '1978-01-30'
where id = '00000000-0000-4000-8000-000000000004';

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
-- Tallene 34 møter / 6 turer / 36 meldinger / 4 poller (80 totalt) er BUNDET
-- til e2e/tidligere.spec.ts (ANT_MOETE/ANT_TUR/ANT_MELDING/ANT_POLL/
-- ANT_ALLE) — endres ett tall her må speccen oppdateres i samme commit.
-- 80 > TIDLIGERE_SIDESTOERRELSE (30) med vilje: paginering («Last mer»)
-- testes ikke ordentlig med bare et par rader (issuet foreslo opprinnelig
-- «et par», men det dekker ikke paginering — se admins avklaring i #489).
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

-- === Meldinger (36: 1 nylig + 34 dyp historikk + 1 arkivert) ================
-- aktuell_dato holdes null (default) — ingen av speccens forventninger
-- avhenger av festedato-oppførsel.
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
from generate_series(1, 34) as i;

-- Én arkivert melding — regresjonsdekning for #491/#312. sist_aktivitet
-- (1500 dager) er eldre enn ALLE andre meldinger over, så den ville landet
-- utenfor side 1 (posisjon 36 av 36) hvis /tidligere fortsatt paginerte på
-- sist_aktivitet slik #312-bugen gjorde. arkivert_tidspunkt (45 dager) er
-- derimot ferskt nok til posisjon 2 i den korrekte sorterings_tidspunkt-
-- rekkefølgen (mig. 120) — altså trygt på side 1. Testen i
-- e2e/tidligere.spec.ts asserter nettopp denne plasseringen.
-- NB: id-en slutter på 99 mens generate_series over teller 1..34 med samme
-- prefiks — vokser serien forbi 98 kolliderer UUID-ene. Flytt denne raden til
-- et eget prefiks først (f.eks. …-9301-…), ikke bare bump serien.
insert into public.meldinger (id, profil_id, innhold, opprettet, sist_aktivitet, arkivert_tidspunkt)
values (
  '00000000-0000-4000-9300-000000000099',
  '00000000-0000-4000-8000-000000000001',
  'Arkivert historisk innlegg — seedet regresjonsdata for /tidligere (#491).',
  now() - interval '1500 days', now() - interval '1500 days',
  now() - interval '45 days'
);

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

-- ─── Turer med destinasjon for /stedene (#514) ─────────────────────────────
-- Ingen av turene i /tidligere-bulken over har `destinasjon` satt (den bulken
-- tester en annen flate) — uten denne blokka har test-instansen NULL
-- plottbare turer, og /stedene viser bare hint-teksten og en tom reiserute
-- uansett hva man endrer. lat/lng er de reelle koordinatene til bysentrum
-- (kun brukt til projeksjon på kartet via lib/europa-kart-data.ts — ingen
-- klubbidentitet i tallene).
--
-- Prefiks 9600 (ikke 9100-9400): e2e/tidligere.spec.ts sin SEED_HREF_RE
-- (`-4000-9[1-4]00-`) skal ikke telle disse med i ANT_TUR — de hører til en
-- annen spec sin telling og ville ellers krevd en oppdatering der for en
-- endring som ikke har noe med /tidligere å gjøre.
--
-- Byvalg er bevisst spredt langt fra hverandre på kartprojeksjonen (Lisboa/
-- Stockholm/Edinburgh, ikke f.eks. Berlin/København som ligger < 44 px fra
-- hverandre i denne forenklede projeksjonen) — markørenes 44 px treffområder
-- (se TREFF i EuropaKart.tsx) må IKKE overlappe, ellers blir
-- e2e/stedene.spec.ts sine klikk flaky (samme klasse feil som #508 fikset
-- for produksjonskartet).
--
-- Lisboa brukes to ganger (2015 og 2017) for å dekke kartetikettens
-- «x{antall}»-visning. 2018 er bevisst utelatt: fyllHullAar() (lib/reiserute.ts)
-- fyller automatisk inn et hull-år mellom laveste og høyeste registrerte år,
-- og dekker dermed strek-raden i Reiseruta uten en egen «tom»-rad her.
insert into public.arrangementer (id, type, tittel, destinasjon, lat, lng, start_tidspunkt, opprettet_av)
values
  (
    '00000000-0000-4000-9600-000000000001',
    'tur', 'Sommertur til Lisboa', 'Lisboa', 38.7223, -9.1393,
    '2015-06-20T15:00:00Z', '00000000-0000-4000-8000-000000000001'
  ),
  (
    '00000000-0000-4000-9600-000000000002',
    'tur', 'Vintertur til Stockholm', 'Stockholm', 59.3293, 18.0686,
    '2016-11-10T15:00:00Z', '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-9600-000000000003',
    'tur', 'Høsttur til Lisboa', 'Lisboa', 38.7223, -9.1393,
    '2017-09-15T15:00:00Z', '00000000-0000-4000-8000-000000000003'
  ),
  (
    '00000000-0000-4000-9600-000000000004',
    'tur', 'Vårtur til Edinburgh', 'Edinburgh', 55.9533, -3.1883,
    '2019-05-05T15:00:00Z', '00000000-0000-4000-8000-000000000001'
  );

-- ─── Kåringspoller for retry-testen (#520) ─────────────────────────────────
-- Prod har 0 avsluttede kåringspoller og denne fila holdt historisk
-- kaaring_mal_id null overalt — retry-stien i behandleKaaringspoller()
-- (lib/actions/paaminnelser.ts, #495/#504/#521) har derfor ALDRI kjørt mot en
-- ekte database. e2e/kaaring-varsel-retry.spec.ts kjører den ekte cronen
-- (/api/cron/paaminne) mot disse fire radene og verifiserer etterpå at
-- riktige rader ble/ikke ble plukket opp — og setter dem tilbake til
-- tilstanden under i sin egen afterEach (se e2e/helpers/rydd-kaaring-seed.ts),
-- slik at en gjentatt kjøring finner samme utgangspunkt.
--
-- kaaring_mal_id løses via navn (ikke hardkodet uuid): kaaringmaler.id settes
-- av migrasjon 026 med gen_random_uuid() default — verdien er ikke
-- deterministisk på tvers av miljøer/reset. Merk at oppslaget gir NULL uten å
-- feile hvis malen mangler, og cronen filtrerer bort rader uten mal — derfor
-- har e2e/kaaring-varsel-retry.spec.ts en beforeEach som kaster hvis noen av
-- de fire står med kaaring_mal_id = null. Ellers blir speccen grønn på tom luft.
--
-- svarfrist ligger 400 dager tilbake — bevisst LANGT utenfor
-- AGENDA_VINDU_MND (12 mnd), som er vinduet forsiden henter poller i
-- (.gte('svarfrist', cutoff) i lib/queries/agenda.ts). Med en fersk svarfrist
-- havnet «Kåringtest …»-fixturene i agendaens tidligere-seksjon og dermed i
-- de OFFENTLIGE README-skjermbildene som e2e/readme-skjermbilder.spec.ts
-- fanger av «/». Ingen av cron-grenene bryr seg om hvor gammel svarfristen
-- er: fersk-spørringen krever bare `svarfrist < nå`, og retry-vinduet måles
-- på avsluttet_paa. Endres dette må e2e/helpers/rydd-kaaring-seed.ts følge
-- etter i samme commit.
--
-- Fire rader, ikke tre (#520 foreslo «helst tre»): en fjerde («GAMMEL»,
-- avsluttet FØR retry-vinduet) er nødvendig for å faktisk bevise at
-- KAARING_VARSEL_RETRY_DAGER lar en gammel, permanent uvarslebar poll falle
-- ut av køen — ingen av de tre opprinnelige radene dekker den grenen.
insert into public.poll (id, spoersmaal, svarfrist, opprettet_av, kaaring_mal_id, aar, avsluttet_paa, tiebreak_status, vinner_varslet_paa)
values
  (
    -- FERSK: svarfrist passert, ikke behandlet ennå. Plukkes opp av
    -- «fersk»-spørringen (avsluttet_paa is null), som kaller den ekte RPC-en
    -- avslutt_kaaringspoll og lukker pollen. Ingen poll_valg seedes — RPC-en
    -- gir da 'ingen_stemmer' (v_topp_antall er null), som er en gyldig,
    -- ufarlig utgang for testen (se migrasjon 077).
    '00000000-0000-4000-9700-000000000001',
    'Kåringtest FERSK — retry (#520)', now() - interval '400 days',
    '00000000-0000-4000-8000-000000000001',
    (select id from public.kaaringmaler where navn = 'Årets herre'), 2020,
    null, null, null
  ),
  (
    -- AVSLUTTET_MARKERT: allerede avsluttet OG allerede varslet
    -- (vinner_varslet_paa satt) — retry-spørringen skal IKKE plukke denne
    -- opp. Dekker «backfillen gjør at historiske poller ikke plukkes opp».
    '00000000-0000-4000-9700-000000000002',
    'Kåringtest AVSLUTTET_MARKERT — retry (#520)', now() - interval '400 days',
    '00000000-0000-4000-8000-000000000001',
    (select id from public.kaaringmaler where navn = 'Årets herre'), 2021,
    now() - interval '3 days', 'avgjort', now() - interval '3 days'
  ),
  (
    -- AVSLUTTET_UMARKERT: avsluttet, INNENFOR retry-vinduet, uten markør —
    -- SKAL plukkes opp og stemples av retry-spørringen. Dette ER #520s
    -- kjernepåstand.
    '00000000-0000-4000-9700-000000000003',
    'Kåringtest AVSLUTTET_UMARKERT — retry (#520)', now() - interval '400 days',
    '00000000-0000-4000-8000-000000000001',
    (select id from public.kaaringmaler where navn = 'Årets herre'), 2022,
    now() - interval '2 days', 'avgjort', null
  ),
  (
    -- AVSLUTTET_GAMMEL: avsluttet UTENFOR retry-vinduet (10 dager > 7 =
    -- KAARING_VARSEL_RETRY_DAGER), uten markør — skal IKKE plukkes opp,
    -- fordi tidsvinduet lar den falle ut selvhelende (jf. #504).
    '00000000-0000-4000-9700-000000000004',
    'Kåringtest AVSLUTTET_GAMMEL — retry (#520)', now() - interval '400 days',
    '00000000-0000-4000-8000-000000000001',
    (select id from public.kaaringmaler where navn = 'Årets herre'), 2023,
    now() - interval '10 days', 'avgjort', null
  );

-- ─── Fixtures for røyktesten (e2e/sider-laster.spec.ts) ────────────────────
-- Bakgrunn: 17 av appens sider gjør databasespørringer uten at noen test
-- noensinne LASTET dem. En brutt spørring der (feil kolonnenavn etter en
-- migrasjon, en manglende GRANT, en join som ryker) ble først oppdaget av et
-- medlem i prod. Røyktesten laster hver rute og krever 200 + rendret
-- overskrift; dette er radene detaljsidene (`[id]`-rutene) trenger for å
-- treffe INNHOLDS-grenen i stedet for notFound().
--
-- Prefiks 9800 — utenfor både SEED_HREF_RE i tidligere.spec.ts (9[1-4]00),
-- 9600 (/stedene) og 9700 (kåringsretry), slik at tellingene i de spec-ene
-- ikke rører seg av at vi legger til data her.
--
-- Alle tidsstempler er relative (now() - interval) så fixturene aldri «går ut
-- på dato», og alle rader er knyttet til de fire seedede testprofilene.

-- Klubb-chat (/chat). Tom tabell rendrer også fint, men da tester vi
-- tom-tilstanden i stedet for meldingslista — og det er lista som joiner mot
-- profiles og dermed kan ryke.
insert into public.klubb_chat (id, profil_id, innhold, opprettet)
values
  (
    '00000000-0000-4000-9800-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Røyktest: første melding i klubb-chatten.', now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-9800-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'Røyktest: svar fra et annet medlem.', now() - interval '1 day'
  );

-- Bilder i klubb-chatten (/album/chatten, e2e/album-chatten-lightbox.spec.ts,
-- #623). Uten disse har den seedede (fersk `supabase start` i CI) chatten
-- ingen bilde_url-rader i det hele tatt, og speccen skipper stille i stedet
-- for å bevise noe — nøyaktig feilmodusen #535 lukket, som
-- e2e/sikkerhetsvakt.spec.ts vokter mot. Tre rader: nok til å bevise
-- sveip/pil-navigasjon (krever minst 2), og innhold er bevisst NULL — et
-- rent bildeinnlegg, ikke bilde+tekst (mig. 063 tillater begge).
insert into public.klubb_chat (id, profil_id, innhold, bilde_url, opprettet)
values
  (
    '00000000-0000-4000-9800-000000000003',
    '00000000-0000-4000-8000-000000000001',
    null, 'https://fixtur.r2.dev/roykttest/bilde-1.jpg', now() - interval '3 days'
  ),
  (
    '00000000-0000-4000-9800-000000000004',
    '00000000-0000-4000-8000-000000000002',
    null, 'https://fixtur.r2.dev/roykttest/bilde-2.jpg', now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-9800-000000000005',
    '00000000-0000-4000-8000-000000000003',
    null, 'https://fixtur.r2.dev/roykttest/bilde-1.jpg', now() - interval '1 day'
  );

-- Privat samtale (/samtaler og /samtaler/[id]). Partene er e2e-admin og
-- Petter — admin er den innloggede brukeren i suiten, så inboksen viser raden.
-- Merk at e2e/rls/privat-samtale.spec.ts lager sine EGNE samtaler og rører
-- ikke denne; den skal kunne stå urørt mellom kjøringer.
insert into public.samtale (id, profil_a, profil_b, opprettet, sist_aktivitet)
values
  (
    '00000000-0000-4000-9800-000000000010',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    now() - interval '5 days', now() - interval '1 day'
  );

insert into public.samtale_chat (id, samtale_id, profil_id, innhold, lest, opprettet)
values
  (
    '00000000-0000-4000-9800-000000000011',
    '00000000-0000-4000-9800-000000000010',
    '00000000-0000-4000-8000-000000000002',
    'Røyktest: melding i privat samtale.', true, now() - interval '1 day'
  );

-- Album (/album og /album/[id]). bilde_url peker på en URL som aldri hentes:
-- Playwright asserterer på DOM-en, ikke på at bildet dekoder, og R2-bøtta har
-- ingen testdata. Domenet må likevel stå i next.config.ts → remotePatterns,
-- ellers kaster <Image> på ugyldig host — derfor r2.dev og ikke example.com.
insert into public.album (id, tittel, opprettet_av, opprettet, oppdatert)
values
  (
    '00000000-0000-4000-9800-000000000020',
    'Røyktest-album', '00000000-0000-4000-8000-000000000001',
    now() - interval '30 days', now() - interval '30 days'
  );

insert into public.album_bilde (id, album_id, bilde_url, lastet_opp_av, rekkefolge, bredde, hoyde, opprettet)
values
  (
    '00000000-0000-4000-9800-000000000021',
    '00000000-0000-4000-9800-000000000020',
    'https://fixtur.r2.dev/roykttest/bilde-1.jpg',
    '00000000-0000-4000-8000-000000000001', 0, 1600, 1200, now() - interval '30 days'
  ),
  (
    '00000000-0000-4000-9800-000000000022',
    '00000000-0000-4000-9800-000000000020',
    'https://fixtur.r2.dev/roykttest/bilde-2.jpg',
    '00000000-0000-4000-8000-000000000001', 1, 1600, 1200, now() - interval '30 days'
  );

-- Varsel i innboksen (/varsler/[id]). profil_id må være den innloggede
-- brukeren: RLS på varsel_logg gir kun egne rader, så en rad på en annen
-- profil ville gitt notFound() og testet feil gren.
insert into public.varsel_logg (id, profil_id, tittel, melding, type, kanal, url, lest, opprettet)
values
  (
    '00000000-0000-4000-9800-000000000030',
    '00000000-0000-4000-8000-000000000001',
    'Røyktest-varsel', 'Dette varselet finnes kun i test-instansen.',
    'oppdatert', 'kun_app', '/', false, now() - interval '3 days'
  );

-- Arrangøransvar (/arrangoransvar). To rader: én med ansvarlig og én uten —
-- siden rendrer de to tilstandene ulikt (navn+avatar mot «ikke fordelt»), og
-- en spørring som ryker på left join mot profiles treffer bare den første.
insert into public.arrangoransvar (id, aar, arrangement_navn, ansvarlig_id, purredato, opprettet, oppdatert)
values
  (
    '00000000-0000-4000-9800-000000000040',
    2020, 'Røyktest-sammenkomst',
    '00000000-0000-4000-8000-000000000002',
    (now() - interval '365 days')::date, now(), now()
  ),
  (
    '00000000-0000-4000-9800-000000000041',
    2020, 'Røyktest-tur uten ansvarlig',
    null, null, now(), now()
  );

-- ─── Fondsandel med bevegelser (e2e/fond-bevegelser.spec.ts, #543) ─────────
-- Én innskyter med hele detaljpakken, så accordionen på /fond har noe å utvide.
--
-- Står på Petter (8000…002), IKKE på e2e-admin (8000…001): den sistnevntes
-- fondsandel skal forbli 0 kr, ellers ryker assertionen i profil-fond-andel.spec.ts.
--
-- Tallene summerer seg: 9000 + 450 + (500 + 500 + 4500 − 2000) = 12950.
-- Et seed som IKKE summerte seg ville vist en oppdeling som ikke stemmer med
-- totalen over seg, og da tester vi at UI-et gjengir feil data pent.
--
-- Datoene er relative til inneværende år (date_trunc), aldri hardkodet årstall:
-- bevegelsene må ligge i samme år som innskuddets dato, ellers filtrerer siden
-- dem bort — og en hardkodet 2026-dato ville stille tømt accordionen 1. januar.
-- Alle legges i januar, så de er i fortiden uansett når suiten kjøres.

-- Ola (8000…003) er kontrasten: en andel UTEN detaljpakke, altså slik en rad ser
-- ut når den er importert fra et eldre API-svar. Raden skal vises i lista, men
-- IKKE være utvidbar — en accordion som åpner ingenting er verre enn ingen.
insert into public.fond_innskudd (id, profil_id, belop, dato, oppspart_akkumulert, renteandel_i_fjor)
values
  (
    '00000000-0000-4000-9800-000000000050',
    '00000000-0000-4000-8000-000000000002',
    12950.00, current_date, 9000.00, 450.00
  ),
  (
    '00000000-0000-4000-9800-000000000055',
    '00000000-0000-4000-8000-000000000003',
    3000.00, current_date, 0, 0
  );

-- To bevegelser på samme dato (…052 og …053) skal IKKE slås sammen — de er to
-- hendelser. Den siste er negativ: et uttak.
insert into public.fond_bevegelse (id, profil_id, dato, belop)
values
  ('00000000-0000-4000-9800-000000000051', '00000000-0000-4000-8000-000000000002',
   (date_trunc('year', now()) + interval '14 days')::date,  500.00),
  ('00000000-0000-4000-9800-000000000052', '00000000-0000-4000-8000-000000000002',
   (date_trunc('year', now()) + interval '20 days')::date,  500.00),
  ('00000000-0000-4000-9800-000000000053', '00000000-0000-4000-8000-000000000002',
   (date_trunc('year', now()) + interval '20 days')::date, 4500.00),
  ('00000000-0000-4000-9800-000000000054', '00000000-0000-4000-8000-000000000002',
   (date_trunc('year', now()) + interval '25 days')::date, -2000.00);

-- ─── Verifiser at seeden faktisk landet (#534) ─────────────────────────────
-- «Grønn på tom luft» ved KILDEN: kåringsfixturene over løser kaaring_mal_id
-- via et navneoppslag som gir stille NULL hvis malen mangler (se kommentaren
-- ved #520-blokken) — samme klasse feil kan ramme andre stille avhengigheter
-- i denne fila. I stedet for å oppdage det når en enkelt e2e-spec uventet blir
-- grønn på tomt datagrunnlag, feiler `db reset` HØYLYTT her, med én gang.
do $$
declare
  antall int;
  tabellnavn text;
begin
  -- RLS PÅ alle public-tabeller. Migrasjon 023 gjorde `drop table
  -- kaaring_vinnere cascade` + gjenskapte tabellen, migrasjon 106 gjenopprettet
  -- policyene — men ingen migrasjon skrudde RLS PÅ igjen. En ny tabell har RLS
  -- av som default, og policies uten RLS er ren dekorasjon: de håndheves ikke.
  -- Det sto slik i to år og ble først funnet av e2e/rls/-suiten (#533), lukket
  -- av migrasjon 125. Denne sjekken lukker PROBLEMKLASSEN i stedet for det ene
  -- tilfellet: enhver fremtidig tabell som lander uten `enable row level
  -- security` feiler `db reset` høylytt her, ved kilden, med navnet sitt i
  -- meldingen.
  select count(*), string_agg(c.relname, ', ' order by c.relname)
    into antall, tabellnavn
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and not c.relrowsecurity;
  if antall <> 0 then
    raise exception 'Seed-verifisering: % public-tabell(er) har RLS AV — policyene deres håndheves IKKE: %. Legg «alter table public.<tabell> enable row level security;» i en migrasjon (jf. mig. 125 / #533).', antall, tabellnavn;
  end if;

  select count(*) into antall from public.kaaringmaler where navn = 'Årets herre';
  if antall = 0 then
    raise exception 'Seed-verifisering: fant ikke kaaringmalen «Årets herre» — #520-fixturene får kaaring_mal_id = null uten å feile.';
  end if;

  -- De fire 9700-pollene (retry-testen, #520) må finnes MED kaaring_mal_id satt.
  select count(*) into antall
  from public.poll
  where id::text like '00000000-0000-4000-9700-%' and kaaring_mal_id is not null;
  if antall <> 4 then
    raise exception 'Seed-verifisering: forventet 4 kåringspoller (prefiks 9700) med kaaring_mal_id satt, fant %.', antall;
  end if;

  -- De fire 9600-turene (/stedene, #514) må ha lat/lng satt.
  select count(*) into antall
  from public.arrangementer
  where id::text like '00000000-0000-4000-9600-%' and lat is not null and lng is not null;
  if antall <> 4 then
    raise exception 'Seed-verifisering: forventet 4 turer (prefiks 9600) med lat/lng satt, fant %.', antall;
  end if;

  -- e2e-innloggingsbrukeren må finnes i BEGGE auth.users og profiles, med admin-rolle.
  select count(*) into antall
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.email = 'e2e-admin@klubb.test' and p.rolle = 'admin';
  if antall <> 1 then
    raise exception 'Seed-verifisering: e2e-admin@klubb.test mangler i auth.users/profiles, eller har ikke admin-rolle.';
  end if;

  -- Nøyaktig én generalsekretær (#533-testbrukeren Gunnar). Partial unique
  -- index profiles_unik_generalsekretaer (mig. 094) ville uansett feilet
  -- HARDT ved et duplikat — denne sjekken fanger i stedet det MOTSATTE
  -- feilmodus: at oppdateringen aldri traff (feil id, kolonne omdøpt).
  select count(*) into antall from public.profiles where rolle = 'generalsekretaer';
  if antall <> 1 then
    raise exception 'Seed-verifisering: forventet nøyaktig 1 profil med rolle=generalsekretaer (Gunnar General), fant %.', antall;
  end if;

  -- Røyktest-fixturene (prefiks 9800): detaljsidene i e2e/sider-laster.spec.ts
  -- gir notFound() uten dem, og speccen ville da grønt bekreftet 404-grenen i
  -- stedet for innholds-grenen den er skrevet for. Vi teller radene per tabell
  -- i stedet for totalen, slik at meldingen navngir HVA som mangler.
  select count(*) into antall from public.samtale
  where id = '00000000-0000-4000-9800-000000000010';
  if antall <> 1 then
    raise exception 'Seed-verifisering: røyktest-samtalen (9800…010) mangler — /samtaler/[id] ville testet notFound() i stedet for innhold.';
  end if;

  select count(*) into antall from public.album_bilde
  where album_id = '00000000-0000-4000-9800-000000000020';
  if antall <> 2 then
    raise exception 'Seed-verifisering: forventet 2 bilder i røyktest-albumet (9800…020), fant %.', antall;
  end if;

  -- Chat-bilder (9800…003-005): album-chatten-lightbox.spec.ts (#623) trenger
  -- minst 2 for å bevise pil-/sveipenavigasjon — se kommentaren ved insert-en.
  select count(*) into antall from public.klubb_chat
  where id::text like '00000000-0000-4000-9800-%' and bilde_url is not null;
  if antall <> 3 then
    raise exception 'Seed-verifisering: forventet 3 klubb_chat-rader med bilde_url (prefiks 9800), fant % — album-chatten-lightbox.spec.ts (#623) ville skippet stille.', antall;
  end if;

  select count(*) into antall from public.varsel_logg
  where id = '00000000-0000-4000-9800-000000000030'
    and profil_id = '00000000-0000-4000-8000-000000000001';
  if antall <> 1 then
    raise exception 'Seed-verifisering: røyktest-varselet (9800…030) mangler eller står på feil profil — RLS ville skjult det for e2e-admin.';
  end if;

  select count(*) into antall from public.arrangoransvar
  where id::text like '00000000-0000-4000-9800-%';
  if antall <> 2 then
    raise exception 'Seed-verifisering: forventet 2 arrangøransvar-rader (prefiks 9800), fant %.', antall;
  end if;

  -- Fondsandelen må summere seg, ellers tester accordion-speccen at UI-et
  -- gjengir inkonsistente tall pent. Regnes i øre, som i validerOppgjor.
  select count(*) into antall
    from public.fond_innskudd i
   where i.id = '00000000-0000-4000-9800-000000000050'
     and round(i.belop * 100) = round(i.oppspart_akkumulert * 100)
                              + round(i.renteandel_i_fjor * 100)
                              + coalesce((
                                  select sum(round(b.belop * 100))
                                    from public.fond_bevegelse b
                                   where b.profil_id = i.profil_id
                                     and extract(year from b.dato) = extract(year from i.dato)
                                ), 0);
  if antall <> 1 then
    raise exception 'Seed-verifisering: fondsandelen (9800…050) summerer seg ikke — accordionen på /fond ville vist en oppdeling som ikke stemmer med totalen.';
  end if;

  select count(*) into antall from public.fond_bevegelse
  where profil_id = '00000000-0000-4000-8000-000000000002';
  if antall <> 4 then
    raise exception 'Seed-verifisering: forventet 4 fondsbevegelser på Petter, fant %.', antall;
  end if;

  -- Ola skal være uten detaljer — kontrasten testen bruker for å bekrefte at
  -- rader uten data ikke blir knapper. Får han bevegelser, tester speccen ingenting.
  select count(*) into antall from public.fond_bevegelse
  where profil_id = '00000000-0000-4000-8000-000000000003';
  if antall <> 0 then
    raise exception 'Seed-verifisering: Ola skal IKKE ha fondsbevegelser (han er «uten detaljer»-tilfellet), fant %.', antall;
  end if;

  raise notice 'Seed-verifisering OK: kåringsmal, 4 kåringspoller, 4 stedene-turer, røyktest-fixturene, fondsandel med bevegelser, e2e-admin og generalsekretæren er alle på plass.';
end $$;

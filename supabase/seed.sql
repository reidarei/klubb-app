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

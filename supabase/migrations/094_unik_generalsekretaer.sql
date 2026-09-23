-- Unik-garanti for generalsekretær-rollen + atomisk RPC for bytte.
--
-- Bakgrunn (issue #294): tittelen «generalsekretær» skal det aldri være mer
-- enn én av. Inntil nå var det kun konvensjon og UI-advarsel som voktet; en
-- admin som jobber under stress (eller et direktiv via SQL) kunne sette to.
-- Løsningen er belte-og-bukseseler: partial unique index som hard DB-invariant
-- + atomisk RPC som gjør promotér+demotér i én transaksjon uten mellomtilstand.
--
-- Rollene demoteres til 'admin' (ikke 'medlem') fordi personen har tydelig
-- vist at han er tillitsvalgt; en demosjon til vanlig medlem ville vært mer
-- overraskende enn hensikten.

-- 0) Pre-flight: avbryt hvis det allerede er mer enn én generalsekretær.
--    (Ny instans: tabellen er tom, sjekken passerer. Eksisterende instans
--    med maks én generalsekretær passerer også. Kantcase med to: vi ønsker at
--    migrasjonene feiler synlig heller enn å lage et ulogisk alias.)
do $$
declare
  antall integer;
begin
  select count(*) into antall
    from profiles
   where rolle = 'generalsekretaer';

  if antall > 1 then
    raise exception
      'Migrasjon avbrutt: det er % generalsekretærer i databasen. '
      'Reduser til maks én manuelt (UPDATE profiles SET rolle = ''admin'' WHERE …) '
      'og kjør migrasjonen på nytt.', antall;
  end if;
end $$;

-- 1) Partial unique index — garanterer maks én rad med rolle='generalsekretaer'.
--    Partial fordi vi ikke vil begrense antallet admins eller medlemmer.
create unique index if not exists profiles_unik_generalsekretaer
  on public.profiles (rolle)
  where rolle = 'generalsekretaer';

-- 2) RPC: sett_generalsekretaer(ny_profil uuid)
--    Demoterer eksisterende GS til 'admin', promoterer ny til 'generalsekretaer'
--    — alt i én transaksjon. Returnerer den forrige innehaveren (null hvis ingen).
--    Sikkerhetsmodell: SECURITY DEFINER med er_admin()-vakt, ikke RLS-avhengig,
--    fordi en rolle-UPDATE på en annen brukers rad ellers ville kreve admin-policy
--    som tillater UPDATE av alle kolonner.
create or replace function sett_generalsekretaer(ny_profil uuid)
returns table (
  forrige_profil uuid,
  forrige_navn   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forrige_id   uuid;
  v_forrige_navn text;
begin
  -- Kun admin/generalsekretær kan utføre bytte (speiler er_admin()-semantikk)
  if not er_admin() then
    raise exception 'Kun admin kan sette generalsekretær'
      using errcode = '42501';
  end if;

  -- Slå opp sittende generalsekretær
  select id, navn into v_forrige_id, v_forrige_navn
    from profiles
   where rolle = 'generalsekretaer'
   for update;  -- lås raden for å unngå race ved parallelle kall

  -- Tidlig retur hvis ny_profil allerede er GS (ingen operasjon nødvendig)
  if v_forrige_id = ny_profil then
    return query select v_forrige_id, v_forrige_navn;
    return;
  end if;

  -- Demotér sittende GS til 'admin' (ikke 'medlem' — han er fortsatt tillitsvalgt)
  if v_forrige_id is not null then
    update profiles
       set rolle     = 'admin',
           oppdatert = now()
     where id = v_forrige_id;
  end if;

  -- Promotér ny profil til 'generalsekretaer'.
  -- FOUND-sjekk: hvis ny_profil ikke finnes (slettet/feil id) blir UPDATE en
  -- silent no-op som ellers ville returnert OK. Vi vil heller feile synlig.
  update profiles
     set rolle     = 'generalsekretaer',
         oppdatert = now()
   where id = ny_profil;

  if not found then
    raise exception 'Profil % finnes ikke — kan ikke settes som generalsekretær', ny_profil
      using errcode = 'P0002';
  end if;

  return query select v_forrige_id, v_forrige_navn;
end;
$$;

-- 3) RPC: fjern_generalsekretaer(forventet_profil uuid)
--    Demoterer sittende GS til 'admin'. Null GS er gyldig tilstand (f.eks.
--    i overgangsperiode). Returnerer den som ble fjernet.
--
--    forventet_profil-parameteren forhindrer race-tilstand: klienten leser
--    sittende GS ved sidelast, men en annen admin kan ha flyttet tittelen
--    mellom lasting og lagring. Vi demoterer KUN hvis sittende GS-id matcher
--    det klienten forventet. Mismatch → tomrad returneres uten endring, og
--    klienten kan oppdage det og varsle brukeren. forventet_profil = null
--    bevarer gammel oppførsel (demoter hvem enn som sitter).
create or replace function fjern_generalsekretaer(forventet_profil uuid default null)
returns table (
  forrige_profil uuid,
  forrige_navn   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forrige_id   uuid;
  v_forrige_navn text;
begin
  if not er_admin() then
    raise exception 'Kun admin kan fjerne generalsekretær'
      using errcode = '42501';
  end if;

  select id, navn into v_forrige_id, v_forrige_navn
    from profiles
   where rolle = 'generalsekretaer'
   for update;

  if v_forrige_id is null then
    -- Ingen GS å fjerne — returner tomrad (OK, ikke feil)
    return query select null::uuid, null::text;
    return;
  end if;

  -- Race-vakt: hvis klienten oppga forventet profil og det ikke matcher
  -- sittende GS, har noen flyttet tittelen i mellomtiden. Ikke demoter —
  -- returner tomrad så klienten kan oppdage at ingenting ble gjort.
  if forventet_profil is not null and forventet_profil <> v_forrige_id then
    return query select null::uuid, null::text;
    return;
  end if;

  update profiles
     set rolle     = 'admin',
         oppdatert = now()
   where id = v_forrige_id;

  return query select v_forrige_id, v_forrige_navn;
end;
$$;

-- 4) Tilgangsstyring for RPC-funksjonene.
--    Public har ingen execute-grant (Supabase default) — vi gir kun til
--    authenticated slik at anon og public ikke kan kalle funksjonene.
revoke all on function sett_generalsekretaer(uuid) from public;
grant execute on function sett_generalsekretaer(uuid) to authenticated;

revoke all on function fjern_generalsekretaer(uuid) from public;
grant execute on function fjern_generalsekretaer(uuid) to authenticated;

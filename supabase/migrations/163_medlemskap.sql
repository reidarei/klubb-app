-- Multi-tenant 2.1a (#861, #868): medlemskap — rolle og aktiv-status per klubb.
--
-- public.medlemskap (klubb_id, profil_id) er fra nå eneste skrivbare sted for
-- rolle, aktiv, faar_issue_varsler, faar_feilvarsler og bursdagsgratulasjon_aktiv.
-- De fem kolonnene på profiles er et enveis speil for standardklubben, vernet på
-- verdi (beskytt_profil_kolonner) og paritetssjekket ved commit. Speilet fjernes
-- i PR C, med frist før første medlemskap i klubb nr. 2; prod-vakten
-- (lib/medlemskap-speilvakt.ts, cron sjekk-klientfeil) slår alarm hvis det
-- ikke lenger stemmer.
--
-- Standardklubbens uuid er skrevet BOKSTAVELIG i speil-, vern-, paritets- og
-- avviksfunksjonene, aldri standard_klubb_id(): 2.4b (#896) gjør den claim-basert,
-- og speilet må fortsatt peke på klubben profiles-kolonnene faktisk speiler.
-- Rollefunksjonene (er_admin() m.fl.) bruker derimot standard_klubb_id() med vilje.
--
-- Rekkefølgen er bindende (arkitekturstyret, #868): forhåndssjekker, tabell,
-- indekser, grants, backfill, speil/vern/paritet, rollefunksjoner, policyer,
-- RPC-er. Kjøres fra PR-branchen før merge i et kort vindu; fila er frosset
-- etter grønn CI (en fiks blir 164). Down-SQL ligger i PR-teksten.

-- Se 161 om 25P01-varselet: grensen gjelder likevel for resten av fila.
set local lock_timeout = '3s';

-- 1) Forhåndssjekker. Raiser med klar melding før noe er endret.
do $$
declare
  antall_gs integer;
begin
  select count(*) into antall_gs from public.profiles where rolle = 'generalsekretaer';
  if antall_gs > 1 then
    raise exception 'Migrasjon 163 avbrutt: % generalsekretærer i profiles (maks 1).', antall_gs;
  end if;

  if exists (
    select 1 from public.profiles
    where not aktiv and rolle in ('admin', 'generalsekretaer')
  ) then
    raise exception 'Migrasjon 163 avbrutt: inaktiv admin/generalsekretær ville mistet tilgangen når er_admin() begynner å sjekke aktiv.';
  end if;
end $$;

-- 2) Tabellen.
create table public.medlemskap (
  klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict,
  profil_id uuid not null constraint medlemskap_profil_id_fkey references public.profiles(id) on delete cascade,
  rolle text not null default 'medlem' check (rolle in ('medlem', 'admin', 'generalsekretaer')),
  aktiv boolean not null default true,
  faar_issue_varsler boolean not null default false,
  faar_feilvarsler boolean not null default false,
  bursdagsgratulasjon_aktiv boolean not null default false,
  opprettet timestamptz not null default now(),
  oppdatert timestamptz not null default now(),
  primary key (klubb_id, profil_id)
);

-- 3) Indekser. PK-en (klubb_id, profil_id) dekker FK-indeksen for klubb_id.
-- profiles_unik_generalsekretaer røres ikke: den er en del av speilet til PR C.
create index medlemskap_profil_id_idx on public.medlemskap (profil_id);
create unique index medlemskap_unik_generalsekretaer on public.medlemskap (klubb_id) where rolle = 'generalsekretaer';

-- 4) RLS og grants.
-- REVOKE FØR GRANT: authenticated arver GRANT ALL på en ny tabell (jf. 160).
-- Update er en KOLONNE-grant: klubb_id, profil_id og opprettet kan ikke endres
-- fra klienten, selv ikke av admin. Insert/delete går via definer-trigger og service_role.
alter table public.medlemskap enable row level security;

revoke all on public.medlemskap from anon, authenticated;
grant select on public.medlemskap to authenticated;
grant update (rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv, oppdatert) on public.medlemskap to authenticated;
grant select, insert, update, delete on public.medlemskap to service_role;

-- Policyene bruker er_admin(uuid), som opprettes først i steg 8 — de opprettes
-- derfor der. Ingen policy for insert og delete.

-- 5) Backfill FØR triggerne, slik at den ikke fyrer speilet.
insert into public.medlemskap (klubb_id, profil_id, rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv, opprettet)
select '00000000-0000-4000-a000-000000000001'::uuid, id, rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv, opprettet
from public.profiles;

do $$
declare
  antall_m integer;
  antall_p integer;
begin
  select count(*) into antall_m from public.medlemskap;
  select count(*) into antall_p from public.profiles;
  if antall_m <> antall_p then
    raise exception 'Migrasjon 163 avbrutt: backfill ga % medlemskap for % profiler.', antall_m, antall_p;
  end if;

  if exists (
    select 1
    from public.medlemskap m
    join public.profiles p on p.id = m.profil_id
    where (m.rolle, m.aktiv, m.faar_issue_varsler, m.faar_feilvarsler, m.bursdagsgratulasjon_aktiv)
      is distinct from (p.rolle, p.aktiv, p.faar_issue_varsler, p.faar_feilvarsler, p.bursdagsgratulasjon_aktiv)
  ) then
    raise exception 'Migrasjon 163 avbrutt: backfill avviker fra profiles (% medlemskap, % profiler).', antall_m, antall_p;
  end if;
end $$;

-- 6) Speil, vern og paritet. Alle security definer, VOLATILE (de leser rader
-- endret tidligere i samme transaksjon; stable ville gitt et gammelt bilde).

-- Speilet: medlemskap i standardklubben -> de fem kolonnene på profiles.
-- Slettes medlemskapet (ikke via cascade fra profiles, som treffer 0 rader),
-- nullstilles speilet til «ikke medlem».
create function public.medlemskap_speil_til_profiles() returns trigger
  language plpgsql security definer set search_path = public
  as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and old.klubb_id = '00000000-0000-4000-a000-000000000001'::uuid
     and (tg_op = 'DELETE'
          or new.klubb_id <> old.klubb_id
          or new.profil_id <> old.profil_id) then
    update public.profiles
       set rolle = 'medlem', aktiv = false, faar_issue_varsler = false,
           faar_feilvarsler = false, bursdagsgratulasjon_aktiv = false
     where id = old.profil_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.klubb_id = '00000000-0000-4000-a000-000000000001'::uuid then
    update public.profiles
       set rolle = new.rolle, aktiv = new.aktiv,
           faar_issue_varsler = new.faar_issue_varsler,
           faar_feilvarsler = new.faar_feilvarsler,
           bursdagsgratulasjon_aktiv = new.bursdagsgratulasjon_aktiv
     where id = new.profil_id
       and (rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv)
           is distinct from
           (new.rolle, new.aktiv, new.faar_issue_varsler, new.faar_feilvarsler, new.bursdagsgratulasjon_aktiv);
  end if;

  return null;
end;
$$;

create trigger medlemskap_speil_til_profiles
  after insert or update or delete on public.medlemskap
  for each row execute function public.medlemskap_speil_til_profiles();

-- Vernet (a): erstatter funksjonen bak triggeren fra 105 (triggeren røres ikke).
-- Gjelder ALLE, også service_role og SQL-editor: grenen «auth.uid() is null
-- or er_admin()» er borte. Rask vei når ingen av de fem endres (egne
-- profilendringer, markerChatSett); ellers må ny verdi være lik det
-- medlemskapet i standardklubben sier (speilet selv passerer, fordi
-- medlemskapsraden er skrevet før speilet oppdaterer profiles).
create or replace function public.beskytt_profil_kolonner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rolle text;
  v_aktiv boolean;
  v_issue boolean;
  v_feil boolean;
  v_bursdag boolean;
  v_kol text;
begin
  if (new.rolle, new.aktiv, new.faar_issue_varsler, new.faar_feilvarsler, new.bursdagsgratulasjon_aktiv)
     is not distinct from
     (old.rolle, old.aktiv, old.faar_issue_varsler, old.faar_feilvarsler, old.bursdagsgratulasjon_aktiv) then
    return new;
  end if;

  select rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv
    into v_rolle, v_aktiv, v_issue, v_feil, v_bursdag
    from public.medlemskap
   where klubb_id = '00000000-0000-4000-a000-000000000001'::uuid
     and profil_id = new.id;
  if not found then
    v_rolle := 'medlem'; v_aktiv := false; v_issue := false; v_feil := false; v_bursdag := false;
  end if;

  v_kol := case
    when new.rolle is distinct from old.rolle and new.rolle is distinct from v_rolle then 'rolle'
    when new.aktiv is distinct from old.aktiv and new.aktiv is distinct from v_aktiv then 'aktiv'
    when new.faar_issue_varsler is distinct from old.faar_issue_varsler and new.faar_issue_varsler is distinct from v_issue then 'faar_issue_varsler'
    when new.faar_feilvarsler is distinct from old.faar_feilvarsler and new.faar_feilvarsler is distinct from v_feil then 'faar_feilvarsler'
    when new.bursdagsgratulasjon_aktiv is distinct from old.bursdagsgratulasjon_aktiv and new.bursdagsgratulasjon_aktiv is distinct from v_bursdag then 'bursdagsgratulasjon_aktiv'
  end;

  if v_kol is not null then
    raise exception 'medlemskap.speil.vern: profil=% kolonne=% eies av medlemskap (#868)', new.id, v_kol;
  end if;

  return new;
end;
$$;

-- Paritet (b): ved commit må profiles og medlemskapet for standardklubben
-- stemme (uten medlemskap: «medlem, ikke aktiv, ingen flagg»). Fanger det
-- vernet ikke kan se, f.eks. en trigger som er slått av.
create function public.medlemskap_speil_paritet() returns trigger
  language plpgsql security definer set search_path = public
  as $$
declare
  v_profil_ider uuid[];
  v_profil_id uuid;
  p_rolle text; p_aktiv boolean; p_issue boolean; p_feil boolean; p_bursdag boolean;
  m_rolle text; m_aktiv boolean; m_issue boolean; m_feil boolean; m_bursdag boolean;
  v_kol text;
begin
  -- Flyttes en medlemskapsrad mellom profiler (UPDATE av profil_id, mulig for
  -- service_role/postgres), har BEGGE profilene fått nytt fasit-medlemskap:
  -- den gamle mistet sitt, den nye fikk et. Sjekkes bare den nye, kan den
  -- gamle stå med foreldet speil uten at noe reagerer (review av #868).
  if tg_table_name = 'profiles' then
    v_profil_ider := array[new.id];
  elsif tg_op = 'INSERT' then
    v_profil_ider := array[new.profil_id];
  elsif tg_op = 'DELETE' then
    v_profil_ider := array[old.profil_id];
  elsif old.profil_id is distinct from new.profil_id then
    v_profil_ider := array[old.profil_id, new.profil_id];
  else
    v_profil_ider := array[new.profil_id];
  end if;

  foreach v_profil_id in array v_profil_ider loop
    select rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv
      into p_rolle, p_aktiv, p_issue, p_feil, p_bursdag
      from public.profiles where id = v_profil_id;
    if not found then
      continue; -- profilen er slettet (cascade til medlemskap)
    end if;

    select rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv
      into m_rolle, m_aktiv, m_issue, m_feil, m_bursdag
      from public.medlemskap
     where klubb_id = '00000000-0000-4000-a000-000000000001'::uuid and profil_id = v_profil_id;
    if not found then
      m_rolle := 'medlem'; m_aktiv := false; m_issue := false; m_feil := false; m_bursdag := false;
    end if;

    v_kol := case
      when p_rolle is distinct from m_rolle then 'rolle'
      when p_aktiv is distinct from m_aktiv then 'aktiv'
      when p_issue is distinct from m_issue then 'faar_issue_varsler'
      when p_feil is distinct from m_feil then 'faar_feilvarsler'
      when p_bursdag is distinct from m_bursdag then 'bursdagsgratulasjon_aktiv'
    end;

    if v_kol is not null then
      raise exception 'medlemskap.speil.paritet: profil=% kolonne=%', v_profil_id, v_kol;
    end if;
  end loop;

  return null;
end;
$$;

create constraint trigger medlemskap_speil_paritet_profiles
  after insert or update of rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv
  on public.profiles
  deferrable initially deferred
  for each row execute function public.medlemskap_speil_paritet();

create constraint trigger medlemskap_speil_paritet
  after insert or update or delete on public.medlemskap
  deferrable initially deferred
  for each row execute function public.medlemskap_speil_paritet();

-- 7) Overvåking: antall profiler der speilet avviker, og antall klubber med
-- medlemskap. Kalles av cron (service_role) — se lib/medlemskap-speilvakt.ts.
create function public.medlemskap_speil_avvik()
  returns table (avvik bigint, klubber bigint)
  language sql stable security definer set search_path = public
  as $$
  select
    (select count(*)
       from public.profiles p
       left join public.medlemskap m
         on m.profil_id = p.id and m.klubb_id = '00000000-0000-4000-a000-000000000001'::uuid
      where (p.rolle, p.aktiv, p.faar_issue_varsler, p.faar_feilvarsler, p.bursdagsgratulasjon_aktiv)
            is distinct from
            (coalesce(m.rolle, 'medlem'), coalesce(m.aktiv, false), coalesce(m.faar_issue_varsler, false),
             coalesce(m.faar_feilvarsler, false), coalesce(m.bursdagsgratulasjon_aktiv, false))) as avvik,
    (select count(distinct klubb_id) from public.medlemskap) as klubber
$$;

revoke all on function public.medlemskap_speil_avvik() from public, anon, authenticated;
grant execute on function public.medlemskap_speil_avvik() to service_role;

-- 8) er_admin: to overlaster med hver sin kropp (ingen default-argument, ingen
-- delegering). Begge krever nå aktiv — det gjorde ikke 097. Forhåndssjekken
-- over sikrer at ingen sittende admin mister tilgangen av den grunn.
create function public.er_admin(p_klubb_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.medlemskap
    where profil_id = auth.uid()
      and klubb_id = p_klubb_id
      and aktiv
      and rolle in ('admin', 'generalsekretaer')
  )
$$;

revoke execute on function public.er_admin(uuid) from public, anon;
grant execute on function public.er_admin(uuid) to authenticated, service_role;

-- Grants på er_admin() bevares av create or replace. 2.4b gjør standard_klubb_id() claim-basert.
create or replace function public.er_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.medlemskap
    where profil_id = auth.uid()
      and klubb_id = public.standard_klubb_id()
      and aktiv
      and rolle in ('admin', 'generalsekretaer')
  )
$$;

-- Policyer fra steg 4: først nå finnes er_admin(uuid).
-- Inaktive medlemskap er synlige for admin i klubben, ikke for andre. Det er
-- ikke bare en bekvemmelighet: en UPDATE må også la den NYE raden passere
-- select-policyen, så uten admin-unntaket ville `aktiv = false` (deaktivering,
-- oppdater_medlem_admin) feilet med «new row violates row-level security
-- policy» — funnet på test-instansen (#868).
create policy "Medlemskap i klubben er synlige (inaktive bare for admin)" on public.medlemskap
  for select to authenticated
  using (klubb_id = public.standard_klubb_id() and (aktiv or public.er_admin(klubb_id)));

create policy "Admin i klubben oppdaterer medlemskap" on public.medlemskap
  for update to authenticated
  using (public.er_admin(klubb_id))
  with check (public.er_admin(klubb_id));

-- 9) er_generalsekretaer: nå security definer (tidligere invoker uten SET fra
-- 080, som fikk `aktiv` bare via RLS på profiles) og leser medlemskap.
create function public.er_generalsekretaer(p_klubb_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.medlemskap
    where profil_id = auth.uid()
      and klubb_id = p_klubb_id
      and aktiv
      and rolle = 'generalsekretaer'
  )
$$;

revoke execute on function public.er_generalsekretaer(uuid) from public, anon;
grant execute on function public.er_generalsekretaer(uuid) to authenticated, service_role;

create or replace function public.er_generalsekretaer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.medlemskap
    where profil_id = auth.uid()
      and klubb_id = public.standard_klubb_id()
      and aktiv
      and rolle = 'generalsekretaer'
  )
$$;

-- 10) GS-RPC-ene (094), samme signatur og logikk, men mot medlemskap.
-- Speilet fører rollen videre til profiles.
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
  if not er_admin() then
    raise exception 'Kun admin kan sette generalsekretær'
      using errcode = '42501';
  end if;

  select m.profil_id, p.navn into v_forrige_id, v_forrige_navn
    from public.medlemskap m
    join public.profiles p on p.id = m.profil_id
   where m.klubb_id = public.standard_klubb_id()
     and m.rolle = 'generalsekretaer'
   for update of m;

  if v_forrige_id = ny_profil then
    return query select v_forrige_id, v_forrige_navn;
    return;
  end if;

  if v_forrige_id is not null then
    update public.medlemskap
       set rolle     = 'admin',
           oppdatert = now()
     where klubb_id = public.standard_klubb_id()
       and profil_id = v_forrige_id;
  end if;

  update public.medlemskap
     set rolle     = 'generalsekretaer',
         oppdatert = now()
   where klubb_id = public.standard_klubb_id()
     and profil_id = ny_profil;

  if not found then
    raise exception 'Profil % finnes ikke — kan ikke settes som generalsekretær', ny_profil
      using errcode = 'P0002';
  end if;

  return query select v_forrige_id, v_forrige_navn;
end;
$$;

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

  select m.profil_id, p.navn into v_forrige_id, v_forrige_navn
    from public.medlemskap m
    join public.profiles p on p.id = m.profil_id
   where m.klubb_id = public.standard_klubb_id()
     and m.rolle = 'generalsekretaer'
   for update of m;

  if v_forrige_id is null then
    return query select null::uuid, null::text;
    return;
  end if;

  if forventet_profil is not null and forventet_profil <> v_forrige_id then
    return query select null::uuid, null::text;
    return;
  end if;

  update public.medlemskap
     set rolle     = 'admin',
         oppdatert = now()
   where klubb_id = public.standard_klubb_id()
     and profil_id = v_forrige_id;

  return query select v_forrige_id, v_forrige_navn;
end;
$$;

revoke all on function sett_generalsekretaer(uuid) from public;
grant execute on function sett_generalsekretaer(uuid) to authenticated;

revoke all on function fjern_generalsekretaer(uuid) from public;
grant execute on function fjern_generalsekretaer(uuid) to authenticated;

-- 11) handle_ny_bruker (097): oppretter medlemskapet i klubben fra
-- app_metadata.klubb_id (fallback standardklubben; 2.4b gjør fallbacken
-- eksplisitt). Profilen settes inn med aktiv = false: uten standardrad er
-- forventet speilverdi «ikke aktiv», og profiles.aktiv har default true — det
-- ville gitt paritetsbrudd ved commit for et medlemskap utenfor standardklubben.
-- For standardklubben setter speilet aktiv = true i samme transaksjon.
create or replace function handle_ny_bruker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, epost, navn, visningsnavn, aktiv)
  values (
    new.id,
    new.email,
    btrim(split_part(new.email, '@', 1)),
    btrim(split_part(new.email, '@', 1)),
    false
  );

  insert into public.medlemskap (klubb_id, profil_id)
  values (
    coalesce((new.raw_app_meta_data->>'klubb_id')::uuid, public.standard_klubb_id()),
    new.id
  );
  return new;
end;
$$;

-- 12) Admin-redigering av medlem i én transaksjon. SECURITY INVOKER: RLS og
-- kolonne-grant gjelder, og er_admin(p_klubb_id) er vakten. Rekkefølgen er
-- bindende: profiles FØRST, mens raden fortsatt er synlig for RLS
-- (profiles-select krever speilet aktiv = true) — aktiv = false på medlemskapet
-- først ville skjult profilraden for profiles-oppdateringen. Medlemskapet
-- oppdateres uten RETURNING, så select-policyen (aktiv) ikke sperrer en
-- deaktivering. Rollen til sittende generalsekretær røres aldri her
-- (bytte går via sett/fjern_generalsekretaer); retur true = rollen ble skrevet.
create function public.oppdater_medlem_admin(
  p_klubb_id uuid,
  p_profil_id uuid,
  p_navn text,
  p_visningsnavn text,
  p_telefon text,
  p_fodselsdato date,
  p_stikkord text,
  p_matallergier text,
  p_rolle text,
  p_aktiv boolean,
  p_faar_issue_varsler boolean,
  p_faar_feilvarsler boolean
) returns boolean
  language plpgsql security invoker set search_path = public
  as $$
declare
  v_rolle text;
begin
  if not er_admin(p_klubb_id) then
    raise exception 'Ikke admin' using errcode = '42501';
  end if;

  if p_rolle not in ('medlem', 'admin') then
    raise exception 'Ugyldig rolle: %', p_rolle using errcode = '22023';
  end if;

  select rolle into v_rolle
    from public.medlemskap
   where klubb_id = p_klubb_id and profil_id = p_profil_id
   for update;
  if not found then
    raise exception 'Fant ikke medlemskapet' using errcode = 'P0002';
  end if;

  update public.profiles
     set navn = p_navn,
         visningsnavn = p_visningsnavn,
         telefon = p_telefon,
         fodselsdato = p_fodselsdato,
         stikkord = p_stikkord,
         matallergier = p_matallergier,
         oppdatert = now()
   where id = p_profil_id;
  if not found then
    raise exception 'Fant ikke profilen' using errcode = 'P0002';
  end if;

  update public.medlemskap
     set aktiv = p_aktiv,
         faar_issue_varsler = p_faar_issue_varsler,
         faar_feilvarsler = p_faar_feilvarsler,
         rolle = case when v_rolle = 'generalsekretaer' then rolle else p_rolle end,
         oppdatert = now()
   where klubb_id = p_klubb_id and profil_id = p_profil_id;

  return v_rolle <> 'generalsekretaer';
end;
$$;

revoke all on function public.oppdater_medlem_admin(uuid, uuid, text, text, text, date, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.oppdater_medlem_admin(uuid, uuid, text, text, text, date, text, text, text, boolean, boolean, boolean) to authenticated;

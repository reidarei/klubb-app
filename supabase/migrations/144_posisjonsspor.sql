-- Posisjonsspor under et arrangement + pling-varsel (#695).
--
-- ENDRER PREMISSET FRA MIGRASJON 143. Der var hele poenget at vi lagret ÉN rad
-- per mann som ble overskrevet, slik at det ikke fantes noe spor. Reidar har
-- bedt om det motsatte: hver innmeldte posisjon under et pågående arrangement
-- skal bli sin egen prikk, slik at man ser hvor gutta har beveget seg i løpet
-- av kvelden. Det er en bevisst beslutning, ikke en glipp — men det betyr at
-- «ingen historikk lagres» ikke lenger er sant, og teksten på /om-appen og i
-- docs/personvern-vurdering.md er rettet i samme endring.
--
-- Det som holder igjen i stedet: sporet lever KUN så lenge arrangementet
-- varer. Når turen er over slettes punktene, og «slutt å dele» sletter dem
-- umiddelbart. Historikken er altså avgrenset til den kvelden den er til for.

-- ── Deling (hvem deler, og hvor lenge) ──────────────────────────────────────
-- Skilt fra punktene fordi de svarer på to forskjellige spørsmål: «deler han?»
-- er én tilstand per mann, «hvor har han vært?» er mange rader. I 143 lå begge
-- i samme rad, noe som var riktig så lenge det bare fantes ett punkt.
create table public.posisjon_deling (
  profil_id  uuid primary key references public.profiles(id) on delete cascade,
  deler_til  timestamptz not null,
  oppdatert  timestamptz not null default now()
);

-- ── Punkter (sporet) ────────────────────────────────────────────────────────
create table public.posisjon_punkt (
  id              uuid primary key default gen_random_uuid(),
  profil_id       uuid not null references public.profiles(id) on delete cascade,
  lat             double precision not null,
  lng             double precision not null,
  noeyaktighet_m  integer,
  registrert      timestamptz not null default now(),
  -- Arrangementet punktet ble registrert under, hvis noe pågikk. NULL betyr
  -- «delt utenom et arrangement» — da finnes det ikke noe spor å bygge, og
  -- kartet viser bare siste punkt. on delete cascade: slettes turen, forsvinner
  -- sporet med den, uten at en oppryddingsjobb må huske det.
  arrangement_id  uuid references public.arrangementer(id) on delete cascade,
  constraint posisjon_punkt_lat_gyldig check (lat between -90 and 90),
  constraint posisjon_punkt_lng_gyldig check (lng between -180 and 180),
  constraint posisjon_punkt_noeyaktighet_gyldig
    check (noeyaktighet_m is null or noeyaktighet_m between 0 and 100000)
);

-- «Siste punkt per mann» er den hyppigste spørringen (kartet tegner den hver
-- gang siden lastes). distinct on (profil_id) ... order by profil_id, registrert
-- desc bruker denne direkte.
create index posisjon_punkt_profil_tid_idx
  on public.posisjon_punkt (profil_id, registrert desc);

-- Oppryddingsjobben sletter per arrangement; uten indeksen blir det full scan
-- hver natt.
create index posisjon_punkt_arrangement_idx
  on public.posisjon_punkt (arrangement_id)
  where arrangement_id is not null;

-- ── Overfør den eksisterende raden fra 143 ──────────────────────────────────
-- Tabellen har i praksis én rad (Reidars egen test), men å droppe den uten å
-- ta med verdien ville fått delingen hans til å forsvinne uforklarlig midt i
-- en test. Rekkefølgen er viktig: les før drop.
insert into public.posisjon_deling (profil_id, deler_til, oppdatert)
select profil_id, deler_til, oppdatert from public.posisjon
on conflict (profil_id) do nothing;

insert into public.posisjon_punkt (profil_id, lat, lng, noeyaktighet_m, registrert)
select profil_id, lat, lng, noeyaktighet_m, oppdatert from public.posisjon;

drop table public.posisjon;

-- ── Tilgang ─────────────────────────────────────────────────────────────────
alter table public.posisjon_deling enable row level security;
alter table public.posisjon_punkt enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30, jf. migrasjonspolicyen). Ingen anon.
grant select, insert, update, delete on public.posisjon_deling to authenticated;
grant select, insert, update, delete on public.posisjon_deling to service_role;
-- Ingen update på punkt: et punkt er en observasjon av hvor noen VAR. Det
-- rettes ikke, det slettes.
grant select, insert, delete on public.posisjon_punkt to authenticated;
grant select, insert, update, delete on public.posisjon_punkt to service_role;

-- Delingen er ikke hemmelig — den er nettopp signalet til de andre om at du er
-- med på kartet.
create policy "Deling er synlig for alle medlemmer"
  on public.posisjon_deling for select
  using (true);

create policy "Egen deling kan settes"
  on public.posisjon_deling for insert
  with check (profil_id = auth.uid());

create policy "Egen deling kan oppdateres"
  on public.posisjon_deling for update
  using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

create policy "Egen deling kan avsluttes"
  on public.posisjon_deling for delete
  using (profil_id = auth.uid());

-- Et punkt er synlig så lenge EIERENS deling er aktiv. Slutter han å dele —
-- eller lar vinduet løpe ut — forsvinner hele sporet hans fra de andres kart i
-- samme øyeblikk, uten at noe må slettes først. Sletting skjer også, men den er
-- opprydding, ikke tilgangskontroll.
--
-- «or profil_id = auth.uid()» lar deg se dine egne punkter uansett, slik at
-- appen kan si «delingen din utløp» i stedet for å late som du aldri delte.
create policy "Punkter er synlige mens eieren deler"
  on public.posisjon_punkt for select
  using (
    profil_id = auth.uid()
    or exists (
      select 1 from public.posisjon_deling d
      where d.profil_id = posisjon_punkt.profil_id
        and d.deler_til > now()
    )
  );

-- En posisjon er en påstand om hvor DU er. Ingen — heller ikke admin — kan
-- skrive den for noen andre.
create policy "Egne punkter kan legges inn"
  on public.posisjon_punkt for insert
  with check (profil_id = auth.uid());

create policy "Egne punkter kan slettes"
  on public.posisjon_punkt for delete
  using (profil_id = auth.uid());

-- ── Varselbryter for pling ──────────────────────────────────────────────────
-- Admin skal kunne skru av hele typen fra kontrollpanelet, som for alle andre
-- varsler. beskrivelse er ordrett lik panel-teksten i lib/varsel-typer.ts.
insert into public.varsel_innstillinger (noekkel, aktiv, beskrivelse)
values ('posisjon_pling', true, 'Pling om hvor noen er (fra «Pling»-knappen på kartet)')
on conflict (noekkel) do nothing;

-- #641 — generert bursdagsbilde av mannen som fyller år. Bildet lages av en
-- egen cron-jobb dagen før bursdagen (Vertex AI, se lib/vertex.ts), lagres i
-- R2, og lever i denne tabellen med et lease-basert claim slik at flere
-- cron-invokasjoner samme morgen ikke genererer to bilder eller krasjer i
-- hverandre. Se CLAUDE.md § Policy: AI-funksjoner og docs/ai-act-vurdering.md.
--
-- Nøkkelen er (profil_id, feiringsdato) — én rad per mann per år, ikke én
-- rad per mann. Det gjør historikk mulig (fjorårets bilde ligger fortsatt
-- der) og gjør «har vi allerede laget et bilde til DENNE bursdagen»
-- utvetydig uten en egen aar-kolonne å holde i synk manuelt.

create table public.bursdagsbilde (
  -- on delete cascade: sletter noen en profil, forsvinner bursdagsbilde-
  -- raden med den. MERK: cascade rydder kun DB-raden — R2-objektet
  -- bilde_url peker til blir IKKE slettet av dette. Det er en kjent,
  -- akseptert lekkasje (medlemssletting er sjeldent og admin-drevet, ikke
  -- en selvbetjent handling) — samme avveining som andre bilde-bærende
  -- tabeller i appen som ikke rydder R2 ved cascade.
  profil_id uuid not null
    constraint bursdagsbilde_profil_id_fkey references public.profiles(id) on delete cascade,
  feiringsdato date not null,
  -- Generert, ikke skrevet fra klient — utledes av feiringsdato slik at den
  -- aldri kan drifte fra den faktiske raden. Ren visningsbekvemmelighet for
  -- admin-flaten (gruppering per år); ikke del av primærnøkkelen.
  aar int generated always as (extract(year from feiringsdato)::int) stored,
  status text not null default 'paagaar'
    check (status in ('paagaar', 'ferdig', 'feilet', 'avvist', 'fjernet')),
  forsok int not null default 0,
  paabegynt timestamptz,
  bilde_url text,
  prompt text,
  modell text,
  siste_feil text,
  slettet_paa timestamptz,
  -- Den ANDRE FK-en til profiles på denne tabellen — bevisst, ikke en
  -- forglemmelse. Med to FK-er til samme tabell MÅ ethvert PostgREST-embed
  -- av profiles fra bursdagsbilde (eller motsatt vei) FK-kvalifiseres
  -- (`bursdagsbilde!bursdagsbilde_profil_id_fkey(...)`), ellers svarer
  -- PostgREST PGRST201 («more than one relationship found»). Det gjør
  -- FK-kvalifiseringen i lib/queries/agenda.ts lastbærende fra dag én —
  -- en glemt kvalifisering feiler i CI/e2e, ikke stille i prod om et år.
  slettet_av uuid
    constraint bursdagsbilde_slettet_av_fkey references public.profiles(id) on delete set null,
  primary key (profil_id, feiringsdato)
);

alter table public.bursdagsbilde enable row level security;

-- === Data API-tilgang (§ Policy: Migrasjoner) ================================
revoke all on public.bursdagsbilde from anon, authenticated;

-- feiringsdato og status MÅ være med i select-granten selv om admin-flaten
-- er eneste UI som filtrerer på dem direkte — PostgREST krever select-
-- privilegium på enhver kolonne brukt i en .eq()/.filter() fra klient, ikke
-- bare på kolonnene som faktisk returneres. profil_id trengs tilsvarende
-- for embed-joinen fra profiles. Uten disse tre svarer PostgREST 42501 på
-- akkurat agenda-embedet, selv om RLS-policyen under tillater raden.
grant select (profil_id, feiringsdato, aar, status, bilde_url) on public.bursdagsbilde to authenticated;
grant select, insert, update, delete on public.bursdagsbilde to service_role;

-- Uten denne policyen blir embedet i lib/queries/agenda.ts stille TOMT for
-- alle 18 (RLS default-nekter), ikke en feil — en subtil variant av
-- «feiler stille som ingen bursdag» som Policy: Databasespørringer advarer
-- mot andre steder. Alle innloggede kan lese: bursdagsbilder er ikke
-- sensitive utover det et profilbilde allerede er.
create policy "Alle innlogget kan lese bursdagsbilder" on public.bursdagsbilde
  for select to authenticated using (true);

-- === krev_bursdagsbilde(): lease-basert claim ================================
--
-- (a) Hvorfor RPC og ikke PostgREST .upsert(): et upsert kan ikke uttrykke
-- en betinget WHERE på conflict-grenen (vi skal KUN overskrive en rad som
-- er ledig-for-forsøk — en rad en annen invokasjon nettopp har startet på
-- skal stå urørt), og supabase-js har ingen måte å skrive et kolonne-
-- refererende uttrykk som `forsok = forsok + 1` i en .upsert()-payload.
-- Begge deler er trivielt i rå SQL via `on conflict ... do update ... where`.
--
-- (b) Tallene under speiler lib/konstanter.ts: '10 minutes' =
-- BURSDAGSBILDE_LEASE_MIN, '60 seconds' = BURSDAGSBILDE_TVING_LEASE_SEK,
-- 5 = BURSDAGSBILDE_MAKS_FORSOK. Endres konstantene, må denne funksjonen
-- følge etter (samme disiplin som stikkord_gyldig() i migrasjon 138).
--
-- (c) Den tvungne grenen (admin sin «Generer»-knapp) tar over en lease som
-- er yngre enn 60 sekunder BARE hvis status ikke er 'paagaar' — den taper
-- altså mot en reell, fersk kjøring — men den GÅR RUNDT forsøkstaket
-- (forsok < 5). En admin skal kunne trykke «Generer» så mange ganger han
-- vil uten å bli blokkert av cronens automatiske tak. Den TELLER heller
-- ikke opp `forsok`: telleren er cronens budsjett, og en admin som prøver
-- to ganger i september skal ikke etterlate cron med tre forsøk igjen i
-- mars. `forsok` leses altså som «automatiske forsøk», ikke «kall totalt».
--
-- (d) Den tvungne grenen overtar også status 'fjernet': admin skal kunne
-- regenerere et bilde han nettopp har slettet, uten en SQL-runde.
create or replace function public.krev_bursdagsbilde(
  p_profil_id uuid,
  p_feiringsdato date,
  p_tvungen boolean default false
)
returns setof public.bursdagsbilde
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.bursdagsbilde (profil_id, feiringsdato, status, paabegynt, forsok)
  values (p_profil_id, p_feiringsdato, 'paagaar', now(),
          case when p_tvungen then 0 else 1 end)
  on conflict (profil_id, feiringsdato) do update
     set status = 'paagaar',
         paabegynt = now(),
         forsok = bursdagsbilde.forsok + case when p_tvungen then 0 else 1 end,
         siste_feil = null
   where case
           when p_tvungen then
             bursdagsbilde.status <> 'paagaar'
             or bursdagsbilde.paabegynt < now() - interval '60 seconds'
           else
             (bursdagsbilde.status = 'feilet'
              or (bursdagsbilde.status = 'paagaar'
                  and bursdagsbilde.paabegynt < now() - interval '10 minutes'))
             and bursdagsbilde.forsok < 5
         end
  returning *;
$$;

-- 0 rader tilbake fra funksjonen (tomt resultatsett, ikke en feil) betyr:
-- noen andre holder en fersk lease, raden er i en terminal tilstand
-- ('ferdig'/'avvist', eller 'fjernet' ved ikke-tvungen), eller
-- forsøkstaket er nådd. Kalleren hopper da over — se
-- lib/bursdagsbilde-generering.ts.
revoke execute on function public.krev_bursdagsbilde(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.krev_bursdagsbilde(uuid, date, boolean) to service_role;

-- Ingen indeks utover PK (håndfull rader per år). Ingen backfill (ny
-- funksjon, ingen historikk å fylle inn). Ingen «faar_bursdagsbilde»-
-- opt-out-kolonne på profiles — Reidars beslutning, se issue #641.

-- Enkeltbevegelser per innskyter på fondssiden (#543)
--
-- fond_innskudd er en SNAPSHOT-tabell: én rad per person med totalandelen.
-- Den invarianten står urørt (duplikatvakten i skrivPublisertOppgjor hviler på
-- den) — bevegelsene legges ved siden av, ikke i stedet for.
--
-- En andel er satt sammen slik:
--   belop = oppspart_akkumulert + renteandel_i_fjor + sum(bevegelser i året)
--
-- Tilgang: alle innloggede kan lese alt. Fondet er felleseie, og tallene er
-- ikke hemmelige internt i klubben. Kun skriving (oppgjørs-importen) er admin.

-- ─── Fjorårstall på snapshot-raden ───────────────────────────────────────────
--
-- oppspart_akkumulert er saldoen personen gikk inn i året med, akkumulert over
-- ALLE år (også eldre renteandeler) — men uten fjorårets renteandel, som står
-- for seg selv. Derfor «akkumulert» og ikke «i fjor» i navnet: sistnevnte ville
-- lest som «det han sparte i fjor», og vært galt for alle med mer enn to år bak seg.
--
-- default 0 gjør migreringen trygg for eksisterende rader: et oppgjør importert
-- før denne endringen har ingen fjorårstall, og 0/0 gjør raden uutvidbar i UI-et
-- — som er riktig, siden vi ikke har noe å vise for den.

alter table public.fond_innskudd
  add column oppspart_akkumulert numeric(12,2) not null default 0,
  add column renteandel_i_fjor   numeric(12,2) not null default 0;

-- ─── Bevegelser ──────────────────────────────────────────────────────────────
--
-- Tabellen heter fond_bevegelse, ikke fond_innskudd_detalj: den inneholder også
-- uttak, og et navn som lyver om innholdet blir feillest av neste utvikler.
--
-- belop er fortegnsbærende — positiv = innskudd, negativ = uttak. Fortegnet
-- ligger i beløpet og ikke i en egen type-kolonne, slik at det kun finnes ETT
-- sted og derfor ikke kan motsi seg selv.
--
-- check (belop <> 0): en nullbevegelse er alltid en tom regnearkslinje eller en
-- feil. Bedre å avvise den i DB enn å skjule den i UI-et.
--
-- ON DELETE RESTRICT som fond_innskudd: vi mister aldri pengehistorikk stille
-- ved profilsletting — aktiv håndtering kreves.

create table public.fond_bevegelse (
  id        uuid        primary key default gen_random_uuid(),
  profil_id uuid        not null references public.profiles(id) on delete restrict,
  dato      date        not null,
  belop     numeric(12,2) not null check (belop <> 0),
  opprettet timestamptz not null default now()
);

alter table public.fond_bevegelse enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt).
-- IKKE grant til anon: ingen offentlige flater (jf. #412-auditen).
-- authenticated får kun select — all skriving går via RPC-en under, som er
-- security definer og sjekker er_admin() selv.
grant select                          on public.fond_bevegelse to authenticated;
grant select, insert, update, delete  on public.fond_bevegelse to service_role;

create policy "Autentiserte kan lese fond_bevegelse"
  on public.fond_bevegelse for select
  using (auth.role() = 'authenticated');

-- Indeks: oppslag er alltid «alle bevegelser for en person i et år».
create index on public.fond_bevegelse (profil_id, dato);

-- ─── Atomisk erstatning av et års bevegelser ─────────────────────────────────
--
-- Oppgjøret er et øyeblikksbilde, så årets rader skal ERSTATTES, ikke suppleres.
-- Slett-så-sett-inn må være atomisk: feiler den mellom de to stegene, står
-- personen igjen med NULL rader, som på skjermen leser som «har ikke betalt i
-- år». Det er en løgn i dataene, ikke bare en manglende visning.
--
-- skrivPublisertOppgjor kjører en løkke uten transaksjon, og atomisitet kan
-- ikke uttrykkes derfra — derfor ligger den her, som stemple_pass_varslet().
-- Hele løkken er én setning fra klientens side, altså én transaksjon.
--
-- p_data er andels-listen: [{ profil_id, bevegelser: [{ dato, belop }] }]
-- En person med tom bevegelses-liste får radene sine slettet og ingen nye —
-- det er riktig, og betyr «ingen bevegelser i år så langt».

create or replace function public.skriv_fond_bevegelser(p_aar int, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_andel     jsonb;
  v_profil_id uuid;
begin
  -- security definer omgår RLS, så autorisasjonen må sjekkes eksplisitt her.
  if not er_admin() then
    raise exception 'Kun admin kan skrive fondsbevegelser';
  end if;

  for v_andel in select * from jsonb_array_elements(p_data)
  loop
    v_profil_id := (v_andel->>'profil_id')::uuid;

    -- Avgrens slettingen til året vi importerer. Uten det ville en import
    -- av 2027 tørket ut 2026-historikken.
    delete from fond_bevegelse
     where profil_id = v_profil_id
       and dato >= make_date(p_aar, 1, 1)
       and dato <  make_date(p_aar + 1, 1, 1);

    insert into fond_bevegelse (profil_id, dato, belop)
    select v_profil_id, (b->>'dato')::date, (b->>'belop')::numeric
      from jsonb_array_elements(v_andel->'bevegelser') b;
  end loop;
end;
$$;

-- Postgres gir execute til PUBLIC som default — det er en egen problemklasse
-- fra tabell-grants, og grunnen til at anon i dag kan kalle seks eldre RPC-er.
-- Vi lukker det for denne med en gang i stedet for å arve problemet.
revoke all     on function public.skriv_fond_bevegelser(int, jsonb) from public;
grant  execute on function public.skriv_fond_bevegelser(int, jsonb) to authenticated;
grant  execute on function public.skriv_fond_bevegelser(int, jsonb) to service_role;

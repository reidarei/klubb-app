-- #504 (dekker også #495) — arkitekturstyrets doktrine: «ingen tilstandsendring
-- får være sin egen varsel-nøkkel». Se CLAUDE.md § Policy: Varsler for hele
-- doktrinen. Kort: markøren for «varslet om» bor på TILSTANDSRADEN
-- (`varslet_paa` / `vinner_varslet_paa`), satt via compare-and-swap når
-- sendVarsel() returnerer uten å kaste. `varsel_logg.dedup_noekkel` er en
-- separat GUARD som hindrer duplikat per mottaker — den beskytter ikke
-- markøren, kun selve utsendingen.
--
-- Alt i denne fila er additivt. Rollback = ignorer de nye kolonnene.

-- === a) pass_tilgang_forespørsel.varslet_paa ================================
-- Markør for «søkeren er varslet om utfallet av forespørselen» (godkjent
-- eller avslått). Settes av stemple_pass_varslet() under, aldri direkte
-- fra klient.
alter table public."pass_tilgang_forespørsel"
  add column if not exists varslet_paa timestamptz;

-- Backfill i SAMME fil som add column — ellers ser første cron-/UI-lesing
-- alle historiske forespørsler som «behandlet, ikke varslet» og fyller
-- restanselisten med falske restanser fra dag én. 0 rader i prod per
-- driftens auditering (#504), men backfillen beskytter test-instans, seed
-- og klubb-app-instanser som har egen historikk.
update public."pass_tilgang_forespørsel"
   set varslet_paa = coalesce(besluttet_paa, now())
 where status <> 'venter'
   and varslet_paa is null;

-- === b) poll.vinner_varslet_paa =============================================
-- Markør for «kåringsutfallet (vinner/tiebreak/ingen stemmer) er varslet».
alter table public.poll
  add column if not exists vinner_varslet_paa timestamptz;

-- Ufravikelig backfill: uten denne ser første cron-kjøring hver historiske
-- kåring helt tilbake til #87 som «avsluttet, ikke varslet», og pinger hele
-- klubben om fjorårets resultat. Speiler fortids-sperren for HENDELSE_VARSLER
-- i lib/varsler.ts — samme problemklasse, samme løsning.
update public.poll
   set vinner_varslet_paa = avsluttet_paa
 where avsluttet_paa is not null
   and vinner_varslet_paa is null;

-- === c) varsel_logg.dedup_noekkel ===========================================
-- Generisk per-mottaker-guard. Navnerom-prefikset av kalleren (f.eks.
-- «pass-godkjent:{id}», «bursdag:{barnId}:{aar}») — uten prefiks kolliderer
-- to features stille på samme {uuid}. Ingen backfill: eksisterende rader
-- har ikke og skal ikke ha en dedup_noekkel (dagens (type, arrangement_id)/
-- (type, poll_id)-dedup migreres bevisst IKKE hit, se CLAUDE.md).
alter table public.varsel_logg
  add column if not exists dedup_noekkel text;

create unique index if not exists varsel_logg_dedup_noekkel_uniq
  on public.varsel_logg (dedup_noekkel, profil_id)
  where dedup_noekkel is not null;

-- === d), e) indekser på varsel_logg ==========================================
-- profil_id manglet helt fra før — harUlestVarsler() (lib/ulest.ts) og
-- bursdag-kvitteringsoppslaget seq-scannet tabellen ved hver sidevisning.
create index if not exists varsel_logg_profil_ulest_idx
  on public.varsel_logg (profil_id)
  where lest = false;

create index if not exists varsel_logg_profil_opprettet_idx
  on public.varsel_logg (profil_id, opprettet desc);

-- === f) Kolonnevern på varsel_logg ===========================================
-- Migrasjon 107 ga `authenticated` update på HELE tabellen, og policyen fra
-- 031 har kun USING (ingen WITH CHECK) — en bruker kan i prinsippet endre
-- type/arrangement_id/dedup_noekkel på sine egne rader, og uten WITH CHECK
-- i prinsippet flytte raden til en annen profil_id. Nå som raden dobler som
-- kvittering (bursdag) er det ikke lenger et lavt-alvor-funn.
--
-- Rekkefølgen betyr noe: `revoke update` fjerner update-privilegiet på både
-- tabell- og kolonnenivå, så den påfølgende kolonne-granten må komme ETTER.
revoke update on public.varsel_logg from authenticated;
grant  update (lest) on public.varsel_logg to authenticated;

drop policy if exists "Oppdater egne varsler" on public.varsel_logg;
create policy "Oppdater egne varsler" on public.varsel_logg for update
  using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

-- === g) stemple_pass_varslet(): CAS + forlengelse av gyldig_til =============
-- Eneste skriver til varslet_paa på pass_tilgang_forespørsel — brukes både
-- ved førstegangs-stempling (godkjennPassTilgang/avslaaPassTilgang) og ved
-- en fremtidig «Varsle på nytt»-knapp (PR 2). `where varslet_paa is null`
-- gjør stemplingen idempotent: kalles den to ganger (racy retry) vinner
-- kun den første, og funksjonen svarer ærlig med false til den andre.
--
-- `greatest(gyldig_til, now() + interval '24 hours')` MÅ stå i samme
-- UPDATE-setning som CAS-en — PostgREST kan ikke uttrykke greatest() i et
-- vanlig .update()-kall, og et separat les-så-skriv fra klient/server
-- gjeninnfører racen vi prøver å lukke.
--
-- `case`-en er ikke pynt: greatest() ignorerer NULL i Postgres, så uten den
-- ville en avslått rad (der gyldig_til er NULL) fått satt gyldig_til til
-- now()+24t — å gi tilgangsvindu til en AVSLÅTT forespørsel. Vinduet
-- forlenges derfor kun når status er 'godkjent'.
--
-- interval '24 hours' speiler PASS_TILGANG_TIMER i lib/konstanter.ts
-- (§ Policy: Konstanter) — endres konstanten, må denne følge med.
create or replace function public.stemple_pass_varslet(p_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with oppdatert as (
    update public."pass_tilgang_forespørsel"
       set varslet_paa = now(),
           gyldig_til = case
             when status = 'godkjent' then greatest(gyldig_til, now() + interval '24 hours')
             else gyldig_til
           end
     where id = p_id and varslet_paa is null and status <> 'venter'
    returning 1
  )
  select exists (select 1 from oppdatert)
$$;

-- execute går til PUBLIC som default på nye funksjoner — må revokes
-- eksplisitt. Kun service_role (cron/server actions med admin-klient) skal
-- kunne kalle denne: et medlem må ikke kunne forlenge sitt eget tilgangsvindu.
revoke execute on function public.stemple_pass_varslet(uuid) from public, anon, authenticated;
grant  execute on function public.stemple_pass_varslet(uuid) to service_role;

-- Ingen ny index på pass_tilgang_forespørsel eller poll (titalls/håndfull
-- rader — seq scan er billigere enn en partial index med churn på en
-- kolonne som selv oppdateres). Ingen grants til anon. Nye kolonner arver
-- tabellens eksisterende grants (jf. § Policy: Migrasjoner).

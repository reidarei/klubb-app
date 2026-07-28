-- Skiller «Innspill-varsler» og «Feilvarsler» i to brytere.
--
-- profiles.faar_issue_varsler (migrasjon 104) har styrt to helt ulike ting:
-- varsel om nye innspill (dialog admin↔medlem, GitHub-issues) og døgnalarmen
-- om at appen har feil. Kolonnenavnet stammer fra innspill-formålet, som var
-- det opprinnelige — men å blande dem gjør at et medlem som bare skal følge
-- opp innspill også vekkes av feilalarmer, og omvendt. Reidars beslutning:
-- to uavhengige brytere, samme admin-styrte mønster.
--
-- faar_issue_varsler beholdes uendret (innspill). Ny kolonne faar_feilvarsler
-- tar over som mottaker-filter for /api/cron/sjekk-klientfeil.

-- Kolonne + backfill i samme betingede blokk. Backfillen er ubetinget innenfor
-- blokka, så den MÅ ikke kunne kjøre en gang til: gjør den det mot en base der
-- admin siden har skilt de to bryterne, overskrives faar_feilvarsler stille av
-- innspill-verdien og noen kan miste feilalarmen.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'faar_feilvarsler'
  ) then
    alter table public.profiles
      add column faar_feilvarsler boolean not null default false;

    -- Bevar dagens oppførsel: alle som fikk innspill-varsler fikk også
    -- feilalarmen, så ingen mister alarmen ved denne migrasjonen.
    update public.profiles
      set faar_feilvarsler = faar_issue_varsler;
  end if;
end $$;

-- Kolonnevern (fra 105_beskytt_profil_kolonner.sql) må utvides til å dekke
-- den nye kolonnen også, ellers kan et medlem sette sin egen faar_feilvarsler
-- via PostgREST direkte. create or replace på samme funksjon — ikke ny trigger.
create or replace function public.beskytt_profil_kolonner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or er_admin() then
    return new;
  end if;
  if new.rolle is distinct from old.rolle
     or new.aktiv is distinct from old.aktiv
     or new.faar_issue_varsler is distinct from old.faar_issue_varsler
     or new.faar_feilvarsler is distinct from old.faar_feilvarsler then
    raise exception 'Bare admin kan endre rolle, aktiv, faar_issue_varsler eller faar_feilvarsler';
  end if;
  return new;
end;
$$;

-- Ny kolonne på en eksisterende tabell arver tabellens grants — ingen nye
-- GRANT-statements trengs her (jf. CLAUDE.md § Policy: Migrasjoner, som
-- gjelder nye tabeller/funksjoner/sekvenser).

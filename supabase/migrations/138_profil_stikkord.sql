-- Stikkord på medlemsprofilen (#639).
--
-- Et vanlig felt på medlemsinformasjonen, på linje med telefon og fødselsdato:
-- mannen fyller inn selv på /profil/rediger, admin kan fylle inn for andre, og
-- verdien vises på medlemssiden for alle innloggede.
--
-- VIKTIG: `stikkord` legges bevisst IKKE inn i beskytt_profil_kolonner()
-- (migrasjon 105/123). Den triggeren lister kolonner medlemmet IKKE skal røre
-- på sin egen rad (rolle, aktiv, faar_issue_varsler, faar_feilvarsler).
-- Stikkord SKAL være selv-redigerbart, så det hører ikke hjemme der — dette er
-- et valg, ikke en forglemmelse.
--
-- Rad-RLS fra migrasjon 009 gir allerede nøyaktig det vi trenger:
--   select using (aktiv = true)            → alle medlemmer kan lese
--   update using (id = auth.uid() or er_admin())  → egen rad, eller admin
-- Ingen policy-endring nødvendig.
--
-- Ingen ny GRANT på profiles: en ny kolonne arver tabellens grants
-- (jf. migrasjon 123 § samme note).

alter table public.profiles
  add column stikkord text[] not null default '{}'::text[];

-- Per-element-validering krever en egen funksjon: CHECK tåler ikke subquery,
-- og array_to_string er STABLE (ikke lovlig i CHECK). cardinality() er
-- immutable og kunne stått direkte, men holdes her for å ha én kilde.
--
-- Grensene speiler STIKKORD_MAKS_ANTALL og STIKKORD_MAKS_LENGDE i
-- lib/konstanter.ts — endres de der, må denne funksjonen følge etter.
--
-- Merk: en senere `create or replace` som STRAMMER grensene re-validerer ikke
-- eksisterende rader. Da trengs en egen migrasjon som rydder data først.
create or replace function public.stikkord_gyldig(s text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select cardinality(s) <= 10
     and coalesce(
           (select bool_and(char_length(x) between 1 and 30) from unnest(s) x),
           true);  -- tom array: bool_and over 0 rader gir NULL, og tomt er lovlig
$$;

alter table public.profiles
  add constraint profiles_stikkord_gyldig
  check (public.stikkord_gyldig(stikkord));

-- PUBLIC-default dekker allerede execute, men eksplisitt grant er husets linje
-- (jf. CLAUDE.md § Policy: Migrasjoner).
grant execute on function public.stikkord_gyldig(text[]) to authenticated, service_role;

-- Blåtur-vernet på timeplan-punkter flyttes fra actionen til databasen (#716 review).
--
-- Migrasjon 147 lot lat/lng være actionens ansvar, etter presedensen fra
-- geokodingen i lib/actions/arrangementer.ts. Insert-policyen der sjekker kun
-- `opprettet_av`, så en autentisert klient som går utenom UI-et og skriver rett
-- på Data API-et kunne sette et punkt på en tur med sensurert destinasjon — og
-- en avslørt blåtur er irreversibel. Presedensen holder for en geokodet by som
-- uansett kan gjettes fra teksten; den holder ikke for et koordinat noen har
-- PEKT UT på kartet med vilje.
--
-- Trigger, ikke RLS-policy: en policy måtte NEKTE hele inserten, og det ville
-- rammet arrangøren — han er den eneste som kan lage timeplanen på en blåtur,
-- og har all grunn til å skrive linjer (uten punkt). Triggeren STRIPPER nålen
-- og lar teksten gå. Samme mekanikk som kolonnevernet i migrasjon 105:
-- kolonnenivå kan ikke uttrykkes i en RLS-policy.
--
-- security definer: sensurerte_felt leses fra arrangementer, og vernet skal
-- ikke kunne slås av ved at leseren mangler tilgang til den raden — et
-- RLS-filtrert oppslag ville svart «ingen blåtur» og sluppet nålen gjennom.
-- Funksjonen skriver ingenting utenfor NEW, så definer-rettighetene utvider
-- ikke hva kalleren kan gjøre.
--
-- Merk hva vernet IKKE dekker: sensureres destinasjonen i ETTERKANT, står
-- punkter som alt er lagt inn. De har uansett vært synlige for alle medlemmer
-- siden de ble skrevet, så å fjerne dem da ville vært et ryddetiltak, ikke et
-- vern. Vernet gjelder fra det tidspunktet turen ER en blåtur.

create or replace function public.timeplan_post_strip_blaatur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ingen nål å strippe — hopp over oppslaget. Dette er normaltilfellet:
  -- de aller fleste timeplanlinjer har ingen koordinater.
  if new.lat is null and new.lng is null then
    return new;
  end if;

  if exists (
    select 1
    from public.arrangementer a
    where a.id = new.arrangement_id
      and a.sensurerte_felt ->> 'destinasjon' = 'true'
  ) then
    new.lat := null;
    new.lng := null;
  end if;

  return new;
end;
$$;

-- Også på update, selv om `authenticated` ikke har update-grant i dag
-- (migrasjon 147): vernet skal ikke hvile på at den grant-en aldri kommer.
create trigger timeplan_post_strip_blaatur
  before insert or update on public.timeplan_post
  for each row execute function public.timeplan_post_strip_blaatur();

-- Engangsrydding for rader skrevet i vinduet mellom 147 og denne migrasjonen.
-- Check-constraint timeplan_post_naal_hel er oppfylt: begge settes til null.
update public.timeplan_post p
set lat = null, lng = null
from public.arrangementer a
where a.id = p.arrangement_id
  and a.sensurerte_felt ->> 'destinasjon' = 'true'
  and (p.lat is not null or p.lng is not null);

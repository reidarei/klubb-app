-- Adresse på en timeplan-post, som alternativ til å velge punkt i kartet
-- (#732), og blåtur-vernet skrives om til å dekke ALLE stedsangivelser.
--
-- Avgjørelse fra regissøren: adressen lagres I TILLEGG til koordinatet, ikke
-- i stedet for. Geokoding (lib/geokoding.ts, Nominatim) er best-effort —
-- lykkes den, får posten også et punkt (synlig på kartet); bommer den, står
-- adressen alene og raden er fortsatt trykkbar til Google Maps, som er
-- bedre på gateadresser enn Nominatim. Ingen stille tap av det medlemmet
-- skrev.
alter table public.timeplan_post
  add column adresse text;

alter table public.timeplan_post
  add constraint timeplan_post_adresse_gyldig
  check (adresse is null or length(btrim(adresse)) between 1 and 120);

-- Blåtur-vernet (migrasjon 148) tidlig-returnerte på
-- «new.lat is null and new.lng is null» — riktig da nålen var eneste
-- stedskolonne, men «Middag på Gran Canaria» i adresse-feltet ville gått
-- rett gjennom uendret på en blåtur. Sensurering sjekkes derfor FØRST,
-- deretter strippes ALLE stedskolonner samlet — legges en tredje
-- stedskolonne til senere, skal den strippes her også.
create or replace function public.timeplan_post_strip_blaatur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.arrangementer a
    where a.id = new.arrangement_id
      and a.sensurerte_felt ->> 'destinasjon' = 'true'
  ) then
    new.lat := null;
    new.lng := null;
    new.adresse := null;
  end if;

  return new;
end;
$$;

-- Engangsrydding, samme mønster som migrasjon 148: en adresse skrevet i det
-- (teoretiske) vinduet mellom kolonnen finnes og triggeren over faktisk
-- kjører, skal ikke bli stående usensurert.
update public.timeplan_post p
set lat = null, lng = null, adresse = null
from public.arrangementer a
where a.id = p.arrangement_id
  and a.sensurerte_felt ->> 'destinasjon' = 'true'
  and (p.lat is not null or p.lng is not null or p.adresse is not null);

-- Backfill: koble eksisterende arrangementer til arrangoransvar-rader
-- basert på norsk kalendermåned i start_tidspunkt og navnekonvensjonen i
-- arrangement_navn (samme logikk som lib/arrangoransvar-matching.ts).
--
-- Går kun på ansvar-rader som fortsatt mangler arrangement_id, og arrangementer
-- som er opprettet av en som faktisk er ansvarlig for perioden.

with kandidater as (
  select
    a.id as arrangement_id,
    extract(year from a.start_tidspunkt at time zone 'Europe/Oslo')::int as aar,
    extract(month from a.start_tidspunkt at time zone 'Europe/Oslo')::int as mnd,
    a.opprettet_av
  from arrangementer a
  where not exists (
    select 1 from arrangoransvar ar where ar.arrangement_id = a.id
  )
),
matchinger as (
  select distinct on (ar.aar, ar.arrangement_navn)
    ar.aar,
    ar.arrangement_navn,
    k.arrangement_id
  from kandidater k
  join arrangoransvar ar on ar.aar = k.aar and ar.arrangement_id is null
  where ar.ansvarlig_id = k.opprettet_av
    and (
      (k.mnd between 1 and 2  and lower(ar.arrangement_navn) ~ 'januar|februar')
   or (k.mnd between 3 and 4  and lower(ar.arrangement_navn) ~ 'mars|april')
   or (k.mnd between 5 and 6  and lower(ar.arrangement_navn) ~ 'mai|juni')
   or (k.mnd between 8 and 9  and lower(ar.arrangement_navn) ~ 'august|september')
   or (k.mnd between 10 and 11 and lower(ar.arrangement_navn) ~ 'oktober|november')
   or (k.mnd = 12             and lower(ar.arrangement_navn) ~ 'jule|desember')
    )
)
update arrangoransvar ar
   set arrangement_id = m.arrangement_id
  from matchinger m
 where ar.aar = m.aar
   and ar.arrangement_navn = m.arrangement_navn
   and ar.arrangement_id is null;

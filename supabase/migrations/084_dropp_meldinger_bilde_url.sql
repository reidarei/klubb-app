-- Flat datamodell for melding-bilder. Alle bilder lagres naa i
-- melding_bilder — meldinger.bilde_url var et mellomsteg fra enkelt-
-- bilde-støtte (mig. 058). Backfill av eksisterende rader til
-- melding_bilder (rekkefoelge=0), saa drop kolonnen. FB-importerte rader
-- bruker rekkefoelge>=1, saa 0 kolliderer ikke med unique constraint
-- (mig. 082). Issue #174.

insert into public.melding_bilder (melding_id, bilde_url, rekkefoelge)
select id, bilde_url, 0
from public.meldinger
where bilde_url is not null
on conflict (melding_id, rekkefoelge) do nothing;

alter table public.meldinger drop column if exists bilde_url;

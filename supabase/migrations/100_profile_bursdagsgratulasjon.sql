-- Per-admin toggle for automatisk bursdagsgratulasjon i klubb-chat. Se #328.
-- Kolonnen legges på alle profiler, men logikken i bursdagsgratulasjon.ts
-- sjekker kanAdministrere(rolle) før den brukes — ignoreres for vanlige medlemmer.
-- Default false slik at ingen sender gratulasjoner før de bevisst skrur på.

alter table public.profiles
  add column bursdagsgratulasjon_aktiv boolean not null default false;

comment on column public.profiles.bursdagsgratulasjon_aktiv is 'Per-admin toggle: om denne adminen sender automatiske bursdagsgratulasjoner i klubb-chat. Brukes kun for medlemmer med admin-rettigheter; ignoreres ellers.';

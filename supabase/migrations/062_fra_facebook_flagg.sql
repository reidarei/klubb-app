-- Flagg for arrangementer importert fra Facebook-historikk.
-- Brukes til å skille importerte historiske arrangementer fra ekte
-- arrangementer i appen (RSVP-er er ikke tilgjengelige for FB-historikken,
-- og UI-en kan vise dem litt annerledes — f.eks. uten påmeldings-knapper).
alter table arrangementer
  add column if not exists fra_facebook boolean not null default false;

-- Indeks for å filtrere/skjule FB-historikk i lister effektivt
create index if not exists arrangementer_fra_facebook_idx
  on arrangementer(fra_facebook)
  where fra_facebook = true;

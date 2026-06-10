create table vedtekter (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  tittel    text not null,
  innhold   text not null,
  oppdatert timestamptz not null default now()
);

create table vedtekter_versjoner (
  id            uuid primary key default gen_random_uuid(),
  vedtekt_id    uuid not null references vedtekter(id) on delete cascade,
  innhold       text not null,
  vedtaksdato   date not null,
  endringsnotat text not null,
  endret_av     uuid not null references profiles(id),
  opprettet     timestamptz not null default now()
);

-- Seed: opprett de tre innholdssidene
insert into vedtekter (slug, tittel, innhold) values
  ('vedtekter', 'Vedtekter', '# Vedtekter\n\n_Ingen vedtekter lagt inn ennå._'),
  ('regler', 'Regler', '# Regler\n\n_Ingen regler lagt inn ennå._'),
  ('historikk', 'Historikk', '# Historikk\n\n_Ingen historikk lagt inn ennå._');

create table varsel_innstillinger (
  id          uuid primary key default gen_random_uuid(),
  noekkel     text not null unique,
  aktiv       boolean not null default true,
  dager_foer  integer,
  beskrivelse text,
  oppdatert   timestamptz not null default now()
);

insert into varsel_innstillinger (noekkel, aktiv, dager_foer, beskrivelse) values
  ('paaminnelse_7d', true, 7, 'Påminnelse 7 dager før arrangement'),
  ('paaminnelse_1d', true, 1, 'Påminnelse dagen før arrangement'),
  ('purring_aktiv',  true, null, 'Purring til ansvarlige — dato settes per rad i arrangoransvar.purredato');

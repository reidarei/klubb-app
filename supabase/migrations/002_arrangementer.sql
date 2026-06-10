create type arrangementstype as enum ('moete', 'tur');

create table arrangementer (
  id              uuid primary key default gen_random_uuid(),
  type            arrangementstype not null,
  tittel          text not null,
  beskrivelse     text,
  start_tidspunkt timestamptz not null,
  oppmoetested    text,
  bilde_url       text,
  opprettet_av    uuid not null references profiles(id),
  opprettet       timestamptz not null default now(),
  oppdatert       timestamptz not null default now(),

  -- Tur-spesifikke felter
  slutt_tidspunkt timestamptz,
  destinasjon     text,
  pris_per_person integer,

  -- Blåtur-sensurering
  sensurerte_felt jsonb not null default '{}'::jsonb
);

alter table arrangementer add constraint tur_felt_kun_for_tur check (
  type = 'tur' or (
    slutt_tidspunkt is null and
    destinasjon is null and
    pris_per_person is null and
    sensurerte_felt = '{}'::jsonb
  )
);

create type paameldingsstatus as enum ('ja', 'nei', 'kanskje');

create table paameldinger (
  arrangement_id uuid not null references arrangementer(id) on delete cascade,
  profil_id      uuid not null references profiles(id) on delete cascade,
  status         paameldingsstatus not null,
  oppdatert      timestamptz not null default now(),
  primary key (arrangement_id, profil_id)
);

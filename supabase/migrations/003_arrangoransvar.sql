create table arrangoransvar (
  id               uuid primary key default gen_random_uuid(),
  aar              integer not null,
  arrangement_navn text not null,
  ansvarlig_id     uuid references profiles(id),
  arrangement_id   uuid references arrangementer(id),
  purredato        date,
  opprettet        timestamptz not null default now(),
  oppdatert        timestamptz not null default now(),

  unique (aar, arrangement_navn, ansvarlig_id)
);

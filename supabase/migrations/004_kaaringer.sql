create table kaaringer (
  id           uuid primary key default gen_random_uuid(),
  aar          integer not null,
  kategori     text not null,
  opprettet_av uuid not null references profiles(id),
  opprettet    timestamptz not null default now(),
  oppdatert    timestamptz not null default now()
);

create table kaaring_vinnere (
  id             uuid primary key default gen_random_uuid(),
  kaaring_id     uuid not null references kaaringer(id) on delete cascade,
  profil_id      uuid references profiles(id),
  arrangement_id uuid references arrangementer(id),
  begrunnelse    text,
  check (
    (profil_id is not null)::int +
    (arrangement_id is not null)::int = 1
  )
);

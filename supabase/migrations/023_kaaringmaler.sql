-- Create kaaringmaler table (maler for kåringer, like arrangementmaler)
create table kaaringmaler (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  rekkefølge smallint not null default 0,
  opprettet timestamptz not null default now()
);

-- Drop old kaaringer table (cascade will drop old kaaring_vinnere)
drop table kaaring_vinnere cascade;
drop table kaaringer cascade;

-- Recreate kaaring_vinnere with new structure
create table kaaring_vinnere (
  id uuid primary key default gen_random_uuid(),
  mal_id uuid references kaaringmaler(id) on delete set null,
  aar integer not null,
  profil_id uuid references profiles(id),
  arrangement_id uuid references arrangementer(id),
  begrunnelse text,
  opprettet_av uuid not null references profiles(id),
  opprettet timestamptz not null default now(),
  oppdatert timestamptz not null default now(),
  check (
    (profil_id is not null)::int +
    (arrangement_id is not null)::int <= 1
  ),
  unique(mal_id, aar)
);

-- Create indexes for common queries
create index idx_kaaring_vinnere_mal_id on kaaring_vinnere(mal_id);
create index idx_kaaring_vinnere_aar on kaaring_vinnere(aar);

create table if not exists arrangementmaler (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  rekkefølge smallint not null default 0,
  opprettet timestamptz default now()
);

alter table arrangementmaler enable row level security;

create policy "Autentiserte kan lese arrangementmaler"
  on arrangementmaler for select
  using (auth.role() = 'authenticated');

-- Seed med standardarrangementer
insert into arrangementmaler (navn, rekkefølge) values
  ('Januar-februar møte', 1),
  ('Mars-april møte', 2),
  ('Mai-juni møte', 3),
  ('August-september møte', 4),
  ('Oktober-november møte', 5),
  ('Julebord', 6),
  ('Reisekomiteen', 7);

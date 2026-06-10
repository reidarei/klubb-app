create table arrangement_kommentarer (
  id             uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangementer(id) on delete cascade,
  profil_id      uuid not null references profiles(id) on delete cascade,
  innhold        text not null check (char_length(innhold) between 1 and 1000),
  opprettet      timestamptz not null default now()
);

create index on arrangement_kommentarer (arrangement_id, opprettet);

alter table arrangement_kommentarer enable row level security;

create policy "Aktive kan lese" on arrangement_kommentarer
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste" on arrangement_kommentarer
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne eller admin" on arrangement_kommentarer
  for delete using (
    profil_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and rolle = 'admin')
  );

alter publication supabase_realtime add table arrangement_kommentarer;

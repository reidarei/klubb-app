create table arrangement_chat (
  id             uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references arrangementer(id) on delete cascade,
  profil_id      uuid not null references profiles(id) on delete cascade,
  innhold        text not null check (char_length(innhold) between 1 and 500),
  opprettet      timestamptz not null default now()
);

create index on arrangement_chat (arrangement_id, opprettet);

alter table arrangement_chat enable row level security;

create policy "Aktive kan lese" on arrangement_chat
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste" on arrangement_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne eller admin" on arrangement_chat
  for delete using (
    profil_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and rolle = 'admin')
  );

alter publication supabase_realtime add table arrangement_chat;

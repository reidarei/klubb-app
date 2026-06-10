-- Kommentarer på polls. Speiler arrangement_chat (028) og klubb_chat (038) —
-- egen tabell per scope gir enkle RLS og realtime-filtre.

create table poll_chat (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references poll(id) on delete cascade,
  profil_id uuid not null references profiles(id) on delete cascade,
  innhold   text not null check (char_length(innhold) between 1 and 500),
  opprettet timestamptz not null default now()
);

create index poll_chat_poll_opprettet_idx on poll_chat (poll_id, opprettet);

alter table poll_chat enable row level security;

create policy "Aktive kan lese" on poll_chat
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste" on poll_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne eller admin" on poll_chat
  for delete using (
    profil_id = auth.uid() or er_admin()
  );

alter publication supabase_realtime add table poll_chat;

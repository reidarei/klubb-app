-- Klubb-chat: én felles kronologisk tråd for hele herreklubben.
-- Speiler strukturen i arrangement_chat, men uten arrangement_id — dette er
-- "klubb-scope". Egen tabell (ikke scope-kolonne på arrangement_chat) for
-- å holde RLS og realtime-filtre enkle.

create table klubb_chat (
  id        uuid primary key default gen_random_uuid(),
  profil_id uuid not null references profiles(id) on delete cascade,
  innhold   text not null check (char_length(innhold) between 1 and 500),
  opprettet timestamptz not null default now()
);

-- Indeks på opprettet desc støtter paginering "siste N, så eldre batchvis"
create index on klubb_chat (opprettet desc);

alter table klubb_chat enable row level security;

create policy "Aktive kan lese" on klubb_chat
  for select using (exists (
    select 1 from profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste" on klubb_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and aktiv = true)
  );

create policy "Slette egne eller admin" on klubb_chat
  for delete using (
    profil_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and rolle = 'admin')
  );

alter publication supabase_realtime add table klubb_chat;

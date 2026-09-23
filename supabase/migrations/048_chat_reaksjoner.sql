-- Reaksjoner på chat-meldinger (#85). Dekker både arrangement_chat og
-- klubb_chat — melding_id har ingen FK (begge chat-tabeller har egne uuid'er,
-- og vi trenger ikke referanseintegritet på DB-nivå siden sletting av en
-- melding er sjelden og cascade kan håndteres i app-laget om nødvendig).

create table chat_reaksjoner (
  melding_id uuid not null,
  profil_id  uuid not null references profiles(id) on delete cascade,
  emoji      text not null,
  opprettet  timestamptz not null default now(),
  primary key (melding_id, profil_id, emoji)
);

create index chat_reaksjoner_melding_idx on chat_reaksjoner(melding_id);

alter table chat_reaksjoner enable row level security;

create policy "Alle kan lese chat-reaksjoner"
  on chat_reaksjoner for select
  using (auth.role() = 'authenticated');

create policy "Alle kan legge til egne reaksjoner"
  on chat_reaksjoner for insert
  with check (profil_id = auth.uid());

create policy "Alle kan fjerne egne reaksjoner"
  on chat_reaksjoner for delete
  using (profil_id = auth.uid());

-- Enable realtime på tabellen (krever at vi legger den til supabase_realtime
-- publication). Dette speiler hvordan arrangement_chat og klubb_chat er satt
-- opp.
alter publication supabase_realtime add table chat_reaksjoner;

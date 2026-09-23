-- Kommentarer per bilde i album-lightboxen (#481). Egen tabell adskilt fra
-- de fem eksisterende chat-tabellene — kommentaren sitter på ett bilde, ikke
-- på et arrangement/poll/innlegg. Speiler arrangement_chat (028)/poll_chat
-- (051) i skjemaform, men følger post-069-mønsteret for sletting (kun-egen,
-- ingen admin-bypass — se arkitekturstyrets uttalelse på #481).

create table public.album_bilde_chat (
  id             uuid primary key default gen_random_uuid(),
  album_bilde_id uuid not null references public.album_bilde(id) on delete cascade,
  profil_id      uuid not null references public.profiles(id) on delete cascade,
  innhold        text not null check (char_length(innhold) between 1 and 500), -- 500 speiler CHAT_MAKS_LENGDE
  -- Nullable og ubrukt i v1 (ren tekst). Kolonnene MÅ finnes likevel — den
  -- delte hooken useChatMeldinger selecter bilde_url/video_url ubetinget for
  -- alle chat-scopes, og ville feilet med 42703 uten dem.
  bilde_url      text,
  video_url      text,
  opprettet      timestamptz not null default now()
);

-- Composite-indeks for keyset-paginering (mønster fra mig. 093).
create index album_bilde_chat_paginering_idx on public.album_bilde_chat (album_bilde_id, opprettet desc, id desc);

alter table public.album_bilde_chat enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt). Ingen anon —
-- ingen offentlige flater, jf. #412-auditen. Ingen update — redigering av
-- bilde-kommentarer er ikke støttet i v1.
grant select, insert, delete on public.album_bilde_chat to authenticated;
grant select, insert, delete on public.album_bilde_chat to service_role;

create policy "Aktive kan lese album_bilde_chat" on public.album_bilde_chat
  for select using (exists (
    select 1 from public.profiles where id = auth.uid() and aktiv = true
  ));

create policy "Aktive kan poste album_bilde_chat" on public.album_bilde_chat
  for insert with check (
    profil_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and aktiv = true)
  );

-- Kun-egen sletting (post-069-mønster) — ingen admin-bypass. Admin må gå via
-- service-role hvis noe unntaksvis må fjernes. Se arkitekturstyrets
-- uenighet/konklusjon i #481.
create policy "Slette egne album_bilde_chat" on public.album_bilde_chat
  for delete using (profil_id = auth.uid());

-- Ingen update-policy.

alter publication supabase_realtime add table public.album_bilde_chat;

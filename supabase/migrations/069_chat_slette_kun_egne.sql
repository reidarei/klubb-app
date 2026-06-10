-- Fjern admin-bypass på sletting av chat- og melding-rader. Ny regel: kun
-- forfatter kan slette egne meldinger via UI/API. Hvis noe må fjernes av
-- admin må de gå direkte i Supabase med service-role-key — bevisst
-- friksjon for å unngå utilsiktet sletting av andres innhold.
--
-- Berører alle fem chat-tabeller + hovedinnlegg-tabellen meldinger.
-- UPDATE-policies (redigering) er ikke berørt — der gjelder fortsatt
-- kun egen-eier (var aldri admin-bypass).

drop policy if exists "Slette egne eller admin" on klubb_chat;
create policy "Slette egne" on klubb_chat
  for delete using (profil_id = auth.uid());

drop policy if exists "Slette egne eller admin" on arrangement_chat;
create policy "Slette egne" on arrangement_chat
  for delete using (profil_id = auth.uid());

drop policy if exists "Slette egne eller admin" on poll_chat;
create policy "Slette egne" on poll_chat
  for delete using (profil_id = auth.uid());

drop policy if exists "Slette egne melding_chat eller admin" on melding_chat;
create policy "Slette egne" on melding_chat
  for delete using (profil_id = auth.uid());

drop policy if exists "Slette egne samtale_chat eller admin" on samtale_chat;
create policy "Slette egne" on samtale_chat
  for delete using (profil_id = auth.uid());

drop policy if exists "Slette egne melding eller admin" on meldinger;
create policy "Slette egne" on meldinger
  for delete using (profil_id = auth.uid());

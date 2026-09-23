-- Rull tilbake fra_facebook-vakten i 067. Ny regel: egen-eier kan alltid
-- slette/redigere egne meldinger, også de som er importert fra Messenger.
-- Beholder er_admin()-helperen (cleanup fra 067 som ikke skal rulles tilbake).

drop policy if exists "Slette egne eller admin (ikke FB)" on klubb_chat;
create policy "Slette egne eller admin" on klubb_chat
  for delete using (profil_id = auth.uid() or er_admin());

drop policy if exists "Oppdatere egne (ikke FB)" on klubb_chat;
create policy "Oppdatere egne" on klubb_chat
  for update using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

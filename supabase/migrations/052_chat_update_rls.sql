-- Tillat redigering av egne chat-meldinger. Dekker alle tre chat-tabeller.
-- RLS håndhever at profil_id=auth.uid() både i USING og WITH CHECK — sistnevnte
-- hindrer at noen kan endre profil_id i samme slengen.

create policy "Oppdatere egne" on arrangement_chat
  for update using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

create policy "Oppdatere egne" on klubb_chat
  for update using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

create policy "Oppdatere egne" on poll_chat
  for update using (profil_id = auth.uid())
  with check (profil_id = auth.uid());

-- Frys FB-importerte klubb_chat-meldinger: hverken UPDATE eller DELETE skal
-- være tillatt for fra_facebook = true, uavhengig av rolle. Historikk fra
-- Messenger er bevisst skrivebeskyttet — om noe skal fjernes må admin gjøre
-- det direkte i DB.
--
-- Samtidig: bytt fra inline `rolle = 'admin'` til er_admin()-helperen slik at
-- generalsekretær (som har admin-rettigheter via roller-matrisen) også kan
-- slette egne ikke-FB-meldinger via UI.

drop policy if exists "Slette egne eller admin" on klubb_chat;
create policy "Slette egne eller admin (ikke FB)" on klubb_chat
  for delete using (
    (fra_facebook is null or fra_facebook = false)
    and (profil_id = auth.uid() or er_admin())
  );

drop policy if exists "Oppdatere egne" on klubb_chat;
create policy "Oppdatere egne (ikke FB)" on klubb_chat
  for update using (
    (fra_facebook is null or fra_facebook = false)
    and profil_id = auth.uid()
  )
  with check (
    (fra_facebook is null or fra_facebook = false)
    and profil_id = auth.uid()
  );

-- FB-frys for melding_bilder. Eksisterende DELETE-policy (mig. 081) lar
-- forfatter eller admin slette enhver rad — inkludert bilder på FB-importerte
-- meldinger. UI-en skjuler slette-knappen for FB-importer (mønster fra
-- mig. 067/068 på meldinger), men direkte action-kall slipper gjennom.
-- Lukk hullet i RLS i tråd med samme prinsipp: importert historikk er frosset.
-- Issue #174 (review).

drop policy if exists "Forfatter eller admin kan slette melding_bilder" on melding_bilder;

create policy "Forfatter eller admin kan slette melding_bilder" on melding_bilder
  for delete using (
    (
      exists (select 1 from meldinger where id = melding_id and profil_id = auth.uid())
      or er_admin()
    )
    and not exists (
      select 1 from meldinger where id = melding_id and fra_facebook = true
    )
  );

-- Bilde i meldings-innlegg (#90 — utvidelse). Egen storage-bucket for å
-- holde dem adskilt fra arrangement- og profilbilder, samme RLS-mønster
-- som migrasjon 017.

alter table meldinger add column bilde_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'melding-bilder',
  'melding-bilder',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Alle kan se melding-bilder"
ON storage.objects FOR SELECT
USING (bucket_id = 'melding-bilder');

CREATE POLICY "Innloggede kan laste opp melding-bilder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'melding-bilder'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Eier kan slette egne melding-bilder"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'melding-bilder'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

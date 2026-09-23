-- Opprett storage bucket for profil-bilder
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profil-bilder',
  'profil-bilder',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS-policyer for storage
CREATE POLICY "Alle kan se profil-bilder"
ON storage.objects FOR SELECT
USING (bucket_id = 'profil-bilder');

CREATE POLICY "Eier kan laste opp eget profilbilde"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profil-bilder'
  AND auth.role() = 'authenticated'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Eier kan oppdatere eget profilbilde"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profil-bilder'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Eier kan slette eget profilbilde"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profil-bilder'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

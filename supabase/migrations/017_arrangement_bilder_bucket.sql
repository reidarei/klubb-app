-- Opprett storage bucket for arrangement-bilder
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'arrangement-bilder',
  'arrangement-bilder',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS-policyer for storage
CREATE POLICY "Alle kan se arrangement-bilder"
ON storage.objects FOR SELECT
USING (bucket_id = 'arrangement-bilder');

CREATE POLICY "Innloggede kan laste opp arrangement-bilder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'arrangement-bilder'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Eier kan slette egne bilder"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'arrangement-bilder'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

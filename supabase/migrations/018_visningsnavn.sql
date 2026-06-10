ALTER TABLE profiles ADD COLUMN visningsnavn text;
UPDATE profiles SET visningsnavn = split_part(navn, ' ', 1);
ALTER TABLE profiles ALTER COLUMN visningsnavn SET NOT NULL;

CREATE OR REPLACE FUNCTION handle_ny_bruker()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, epost, navn, visningsnavn)
  VALUES (new.id, new.email, split_part(new.email, '@', 1), split_part(new.email, '@', 1));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

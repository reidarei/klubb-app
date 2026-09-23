-- Forsvar i dybden for 070_trim_profil_navn (#123):
-- handle_ny_bruker-triggeren setter navn/visningsnavn fra auth.users.email
-- (lokaldelen før @) ved opprettelse. Hvis email-en en gang skulle inneholde
-- leading/trailing whitespace, ville INSERT-en bryte CHECK-constraintene
-- profiles_navn_trimmet og profiles_visningsnavn_trimmet.
-- Vi btrim-er verdiene i triggeren slik at constrainten aldri blir
-- brutt på vei inn — uavhengig av om application-laget glipper.

CREATE OR REPLACE FUNCTION handle_ny_bruker()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, epost, navn, visningsnavn)
  VALUES (
    new.id,
    new.email,
    btrim(split_part(new.email, '@', 1)),
    btrim(split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Legg til fødselsdato på profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fodselsdato date;

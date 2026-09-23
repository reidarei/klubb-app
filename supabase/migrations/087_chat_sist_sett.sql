-- Legger til chat_sist_sett på profiles for ulest-prikk på Chat-tab.
-- Ingen RLS-endring: profiles har allerede policy som lar bruker oppdatere
-- egen rad. Ingen ny GRANT: kolonnen arver eksisterende table-grants.
-- Issue #197.

alter table public.profiles
  add column chat_sist_sett timestamptz;

comment on column public.profiles.chat_sist_sett is
  'Når brukeren sist åpnet /chat. Brukes for ulest-prikk på Chat-tab i TopHeader.';

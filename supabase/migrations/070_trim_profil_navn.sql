-- Trim leading/trailing whitespace fra profiles.navn og .visningsnavn (#123).
-- Hvorfor: Facebook-import og fri admin-input ga sporadisk trailing space
-- som ødela sortering og initial-rendering i Avatar.
-- UPDATE-ene er idempotente via WHERE-klausul (no-op hvis allerede trim'd).
-- CHECK-constraintene legges på som siste-line forsvar — application-laget
-- (lib/actions/profil.ts + opprett-medlem/route.ts) trim-er ved kilden.

update profiles set navn = btrim(navn) where navn <> btrim(navn);
update profiles set visningsnavn = btrim(visningsnavn) where visningsnavn <> btrim(visningsnavn);

alter table profiles
  add constraint profiles_navn_trimmet check (navn = btrim(navn));
alter table profiles
  add constraint profiles_visningsnavn_trimmet check (visningsnavn = btrim(visningsnavn));

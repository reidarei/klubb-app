-- Gjenopprett RLS-policies for kaaring_vinnere.
--
-- Bakgrunn: migrasjon 023 droppet og gjenskapte tabellen — DROP TABLE tok
-- med seg 009-policyene i fallet, og 024 la kun policy på kaaringmaler.
-- Resultat: RLS påslått uten policies = alle klient-lesninger og -skrivinger
-- stille blokkert. Usynlig så lenge tabellen var tom; oppdaget ved import av
-- historiske kåringer (Hall of Fame viste ingen vinnere).

create policy "Autentiserte kan lese kåringvinnere"
  on kaaring_vinnere for select
  using (auth.role() = 'authenticated');

create policy "Admin kan sette kåringvinnere"
  on kaaring_vinnere for insert
  with check (er_admin());

create policy "Admin kan endre kåringvinnere"
  on kaaring_vinnere for update
  using (er_admin());

create policy "Admin kan slette kåringvinnere"
  on kaaring_vinnere for delete
  using (er_admin());

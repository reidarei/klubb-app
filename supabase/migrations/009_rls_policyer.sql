-- Aktiver RLS på alle tabeller
alter table profiles enable row level security;
alter table arrangementer enable row level security;
alter table paameldinger enable row level security;
alter table arrangoransvar enable row level security;
alter table kaaringer enable row level security;
alter table kaaring_vinnere enable row level security;
alter table vedtekter enable row level security;
alter table vedtekter_versjoner enable row level security;
alter table push_subscriptions enable row level security;
alter table varsel_innstillinger enable row level security;

-- profiles
create policy "Alle aktive kan lese profiler"
  on profiles for select
  using (aktiv = true);

create policy "Kan oppdatere egen profil eller admin"
  on profiles for update
  using (id = auth.uid() or er_admin());

-- arrangementer
create policy "Alle kan lese arrangementer"
  on arrangementer for select
  using (true);

create policy "Alle kan opprette arrangementer"
  on arrangementer for insert
  with check (opprettet_av = auth.uid());

create policy "Eier eller admin kan oppdatere arrangement"
  on arrangementer for update
  using (opprettet_av = auth.uid() or er_admin());

create policy "Eier eller admin kan slette arrangement"
  on arrangementer for delete
  using (opprettet_av = auth.uid() or er_admin());

-- paameldinger
create policy "Alle kan lese påmeldinger"
  on paameldinger for select
  using (true);

create policy "Kan opprette egen påmelding"
  on paameldinger for insert
  with check (profil_id = auth.uid());

create policy "Kan oppdatere egen påmelding"
  on paameldinger for update
  using (profil_id = auth.uid());

create policy "Kan slette egen påmelding"
  on paameldinger for delete
  using (profil_id = auth.uid());

-- arrangoransvar
create policy "Alle kan lese arrangøransvar"
  on arrangoransvar for select
  using (true);

create policy "Admin kan opprette arrangøransvar"
  on arrangoransvar for insert
  with check (er_admin());

create policy "Admin kan oppdatere arrangøransvar"
  on arrangoransvar for update
  using (er_admin());

create policy "Admin kan slette arrangøransvar"
  on arrangoransvar for delete
  using (er_admin());

-- kaaringer
create policy "Alle kan lese kåringer"
  on kaaringer for select
  using (true);

create policy "Admin kan opprette kåringer"
  on kaaringer for insert
  with check (er_admin());

create policy "Admin kan oppdatere kåringer"
  on kaaringer for update
  using (er_admin());

create policy "Admin kan slette kåringer"
  on kaaringer for delete
  using (er_admin());

-- kaaring_vinnere
create policy "Alle kan lese kåringsvinnere"
  on kaaring_vinnere for select
  using (true);

create policy "Admin kan opprette kåringsvinnere"
  on kaaring_vinnere for insert
  with check (er_admin());

create policy "Admin kan oppdatere kåringsvinnere"
  on kaaring_vinnere for update
  using (er_admin());

create policy "Admin kan slette kåringsvinnere"
  on kaaring_vinnere for delete
  using (er_admin());

-- vedtekter
create policy "Alle kan lese vedtekter"
  on vedtekter for select
  using (true);

create policy "Admin kan oppdatere vedtekter"
  on vedtekter for update
  using (er_admin());

-- vedtekter_versjoner
create policy "Alle kan lese vedtektversjoner"
  on vedtekter_versjoner for select
  using (true);

create policy "Admin kan opprette vedtektversjon"
  on vedtekter_versjoner for insert
  with check (er_admin());

-- push_subscriptions
create policy "Kan lese egne push-abonnementer"
  on push_subscriptions for select
  using (profil_id = auth.uid());

create policy "Kan opprette eget push-abonnement"
  on push_subscriptions for insert
  with check (profil_id = auth.uid());

create policy "Kan oppdatere eget push-abonnement"
  on push_subscriptions for update
  using (profil_id = auth.uid());

create policy "Kan slette eget push-abonnement"
  on push_subscriptions for delete
  using (profil_id = auth.uid());

-- varsel_innstillinger
create policy "Alle kan lese varselinnstillinger"
  on varsel_innstillinger for select
  using (true);

create policy "Admin kan oppdatere varselinnstillinger"
  on varsel_innstillinger for update
  using (er_admin());

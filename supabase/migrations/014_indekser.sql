-- Indekser for ytelse

-- arrangementer: sorteres og filtreres alltid på start_tidspunkt
create index arrangementer_start_tidspunkt_idx on arrangementer (start_tidspunkt);

-- paameldinger: joins mot arrangement_id på nesten alle sider
create index paameldinger_arrangement_id_idx on paameldinger (arrangement_id);

-- paameldinger: bruker finner sin egen påmelding via profil_id
create index paameldinger_profil_id_idx on paameldinger (profil_id);

-- profiles: filtreres på aktiv i statistikk og medlemmer
create index profiles_aktiv_idx on profiles (aktiv);

-- arrangoransvar: filtreres på ansvarlig_id og år
create index arrangoransvar_ansvarlig_id_idx on arrangoransvar (ansvarlig_id);
create index arrangoransvar_aar_idx on arrangoransvar (aar);

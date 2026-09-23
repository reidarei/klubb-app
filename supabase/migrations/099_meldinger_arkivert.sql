-- Arkivering av meldinger: forfatter og admin kan sende et levende innlegg
-- direkte til Tidligere-seksjonen uten å vente på tidsvinduet.
--
-- Vi bruker timestamptz (ikke boolean) fordi det gir oss sortering på
-- arkiveringstidspunkt i Tidligere-seksjonen og bevarer reverteringsinfo.
-- Samme konvensjon som f.eks. besluttet_paa og avsluttet_paa i kodebasen.
--
-- Ingen ny RLS-policy: eksisterende UPDATE-policy på meldinger (mig. 067)
-- dekker allerede dette: «(fra_facebook is null or fra_facebook = false)
-- and (profil_id = auth.uid() or er_admin())». FB-importerte innlegg kan
-- altså ikke arkiveres — blokkert på DB-nivå, ikke bare skjult i UI.
-- Ingen ny GRANT: tabellen eksisterer fra mig. 054, beholder sine
-- grants frem til håndhevingsdato okt. 2026 (se Policy: Migrasjoner).

alter table public.meldinger
  add column arkivert_tidspunkt timestamptz default null;

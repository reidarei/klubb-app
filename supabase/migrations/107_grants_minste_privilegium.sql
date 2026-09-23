-- #412 — Grants-audit: minste privilegium for alle public-tabeller.
--
-- Bakgrunn: Supabase fjerner implisitte default-grants på public-schema
-- 30. oktober 2026. Vi reviderer nå slik at vi er eksplisitte og følger
-- minste-privilegium-prinsippet fremfor å vente på fristen.
--
-- Strategi:
--   anon    → revokert overalt. Appen har ingen offentlige flater.
--             Begge ikke-auth-endepunkter (/api/logg-feil og /api/vitals)
--             bruker service_role-klienten, ikke anon.
--   authenticated → trimmet til nøyaktig de DML-kommandoene som har minst
--             én RLS-policy på tabellen. Admin-only policyer er inkludert —
--             admin kobler som authenticated og gates av er_admin() i policyen.
--   service_role → røres ikke. Bypasser RLS uansett og trenger ikke endring.
--
-- Matrisen er verifisert mot pg_policies (alle 32 tabeller, 2026-07-06).

-- ─── 1. Revoke alt fra anon og authenticated på alle 32 tabeller ─────────────

revoke all on public.album                       from anon, authenticated;
revoke all on public.album_bilde                 from anon, authenticated;
revoke all on public.arrangement_chat            from anon, authenticated;
revoke all on public.arrangementer               from anon, authenticated;
revoke all on public.arrangementmaler            from anon, authenticated;
revoke all on public.arrangoransvar              from anon, authenticated;
revoke all on public.chat_reaksjoner             from anon, authenticated;
revoke all on public.feil_logg                   from anon, authenticated;
revoke all on public.kaaring_vinnere             from anon, authenticated;
revoke all on public.kaaringmaler                from anon, authenticated;
revoke all on public.klubb_chat                  from anon, authenticated;
revoke all on public.melding_bilder              from anon, authenticated;
revoke all on public.melding_chat                from anon, authenticated;
revoke all on public.melding_reaksjon            from anon, authenticated;
revoke all on public.meldinger                   from anon, authenticated;
revoke all on public.paameldinger                from anon, authenticated;
revoke all on public.pass_info                   from anon, authenticated;
revoke all on public."pass_tilgang_forespørsel"  from anon, authenticated;
revoke all on public.poll                        from anon, authenticated;
revoke all on public.poll_chat                   from anon, authenticated;
revoke all on public.poll_stemme                 from anon, authenticated;
revoke all on public.poll_valg                   from anon, authenticated;
revoke all on public.profiles                    from anon, authenticated;
revoke all on public.push_subscriptions          from anon, authenticated;
revoke all on public.samtale                     from anon, authenticated;
revoke all on public.samtale_chat                from anon, authenticated;
revoke all on public.varsel_innstillinger        from anon, authenticated;
revoke all on public.varsel_logg                 from anon, authenticated;
revoke all on public.varsel_preferanser          from anon, authenticated;
revoke all on public.vedtekter                   from anon, authenticated;
revoke all on public.vedtekter_versjoner         from anon, authenticated;
revoke all on public.vitals_logg                 from anon, authenticated;

-- Sekvens: authenticated inserter aldri i feil_logg direkte (ingen insert-policy).
-- service_role beholder sin grant fra migrasjon 101.
revoke all on sequence public.feil_logg_id_seq   from anon, authenticated;

-- ─── 2. Grant minimal til authenticated per RLS-policy-matrisen ──────────────

grant select, insert, update, delete  on public.album                       to authenticated;
grant select, insert, update, delete  on public.album_bilde                 to authenticated;
grant select, insert, update, delete  on public.arrangement_chat            to authenticated;
grant select, insert, update, delete  on public.arrangementer               to authenticated;
grant select                          on public.arrangementmaler            to authenticated;
grant select, insert, update, delete  on public.arrangoransvar              to authenticated;
grant select, insert,         delete  on public.chat_reaksjoner             to authenticated;
grant select                          on public.feil_logg                   to authenticated;
grant select, insert, update, delete  on public.kaaring_vinnere             to authenticated;
grant select                          on public.kaaringmaler                to authenticated;
grant select, insert, update, delete  on public.klubb_chat                  to authenticated;
grant select, insert,         delete  on public.melding_bilder              to authenticated;
grant select, insert, update, delete  on public.melding_chat                to authenticated;
grant select, insert,         delete  on public.melding_reaksjon            to authenticated;
grant select, insert, update, delete  on public.meldinger                   to authenticated;
grant select, insert, update, delete  on public.paameldinger                to authenticated;
grant select, insert, update, delete  on public.pass_info                   to authenticated;
grant select, insert, update          on public."pass_tilgang_forespørsel"  to authenticated;
grant select, insert, update, delete  on public.poll                        to authenticated;
grant select, insert, update, delete  on public.poll_chat                   to authenticated;
grant select, insert,         delete  on public.poll_stemme                 to authenticated;
grant select, insert, update, delete  on public.poll_valg                   to authenticated;
grant select,         update          on public.profiles                    to authenticated;
grant select, insert, update, delete  on public.push_subscriptions          to authenticated;
grant select, insert                  on public.samtale                     to authenticated;
grant select, insert, update, delete  on public.samtale_chat                to authenticated;
grant select,         update          on public.varsel_innstillinger        to authenticated;
grant select,         update          on public.varsel_logg                 to authenticated;
grant select, insert, update          on public.varsel_preferanser          to authenticated;
grant select,         update          on public.vedtekter                   to authenticated;
grant select, insert                  on public.vedtekter_versjoner         to authenticated;
grant select                          on public.vitals_logg                 to authenticated;

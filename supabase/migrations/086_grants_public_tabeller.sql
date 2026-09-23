-- Eksplisitte GRANT-statements på alle 31 tabeller i public-schema.
-- Bakgrunn: Supabase fjerner implisitte default-grants på public-schema
-- 2026-10-30 for eksisterende prosjekter (allerede gjort for nye prosjekter
-- fra 2026-05-30). Uten disse grantene returnerer PostgREST 42501 selv om
-- RLS-policyen tillater raden — Data API ser ikke tabellen.
-- Issue #173. Idempotent — re-kjøring er trygt, GRANT overskriver ikke.
-- Ingen grant til anon: appen har ingen offentlige flater.
-- Ingen sekvens-grants: appen bruker utelukkende UUID-primærnøkler.

grant select, insert, update, delete on public."album"                       to authenticated;
grant select, insert, update, delete on public."album"                       to service_role;

grant select, insert, update, delete on public."album_bilde"                 to authenticated;
grant select, insert, update, delete on public."album_bilde"                 to service_role;

grant select, insert, update, delete on public."arrangement_chat"            to authenticated;
grant select, insert, update, delete on public."arrangement_chat"            to service_role;

grant select, insert, update, delete on public."arrangementer"               to authenticated;
grant select, insert, update, delete on public."arrangementer"               to service_role;

grant select, insert, update, delete on public."arrangementmaler"            to authenticated;
grant select, insert, update, delete on public."arrangementmaler"            to service_role;

grant select, insert, update, delete on public."arrangoransvar"              to authenticated;
grant select, insert, update, delete on public."arrangoransvar"              to service_role;

grant select, insert, update, delete on public."chat_reaksjoner"             to authenticated;
grant select, insert, update, delete on public."chat_reaksjoner"             to service_role;

grant select, insert, update, delete on public."kaaring_vinnere"             to authenticated;
grant select, insert, update, delete on public."kaaring_vinnere"             to service_role;

grant select, insert, update, delete on public."kaaringmaler"                to authenticated;
grant select, insert, update, delete on public."kaaringmaler"                to service_role;

grant select, insert, update, delete on public."klubb_chat"                  to authenticated;
grant select, insert, update, delete on public."klubb_chat"                  to service_role;

grant select, insert, update, delete on public."melding_bilder"              to authenticated;
grant select, insert, update, delete on public."melding_bilder"              to service_role;

grant select, insert, update, delete on public."melding_chat"                to authenticated;
grant select, insert, update, delete on public."melding_chat"                to service_role;

grant select, insert, update, delete on public."melding_reaksjon"            to authenticated;
grant select, insert, update, delete on public."melding_reaksjon"            to service_role;

grant select, insert, update, delete on public."meldinger"                   to authenticated;
grant select, insert, update, delete on public."meldinger"                   to service_role;

grant select, insert, update, delete on public."paameldinger"                to authenticated;
grant select, insert, update, delete on public."paameldinger"                to service_role;

grant select, insert, update, delete on public."pass_info"                   to authenticated;
grant select, insert, update, delete on public."pass_info"                   to service_role;

grant select, insert, update, delete on public."pass_tilgang_forespørsel"    to authenticated;
grant select, insert, update, delete on public."pass_tilgang_forespørsel"    to service_role;

grant select, insert, update, delete on public."poll"                        to authenticated;
grant select, insert, update, delete on public."poll"                        to service_role;

grant select, insert, update, delete on public."poll_chat"                   to authenticated;
grant select, insert, update, delete on public."poll_chat"                   to service_role;

grant select, insert, update, delete on public."poll_stemme"                 to authenticated;
grant select, insert, update, delete on public."poll_stemme"                 to service_role;

grant select, insert, update, delete on public."poll_valg"                   to authenticated;
grant select, insert, update, delete on public."poll_valg"                   to service_role;

grant select, insert, update, delete on public."profiles"                    to authenticated;
grant select, insert, update, delete on public."profiles"                    to service_role;

grant select, insert, update, delete on public."push_subscriptions"          to authenticated;
grant select, insert, update, delete on public."push_subscriptions"          to service_role;

grant select, insert, update, delete on public."samtale"                     to authenticated;
grant select, insert, update, delete on public."samtale"                     to service_role;

grant select, insert, update, delete on public."samtale_chat"                to authenticated;
grant select, insert, update, delete on public."samtale_chat"                to service_role;

grant select, insert, update, delete on public."varsel_innstillinger"        to authenticated;
grant select, insert, update, delete on public."varsel_innstillinger"        to service_role;

grant select, insert, update, delete on public."varsel_logg"                 to authenticated;
grant select, insert, update, delete on public."varsel_logg"                 to service_role;

grant select, insert, update, delete on public."varsel_preferanser"          to authenticated;
grant select, insert, update, delete on public."varsel_preferanser"          to service_role;

grant select, insert, update, delete on public."vedtekter"                   to authenticated;
grant select, insert, update, delete on public."vedtekter"                   to service_role;

grant select, insert, update, delete on public."vedtekter_versjoner"         to authenticated;
grant select, insert, update, delete on public."vedtekter_versjoner"         to service_role;

grant select, insert, update, delete on public."vitals_logg"                 to authenticated;
grant select, insert, update, delete on public."vitals_logg"                 to service_role;

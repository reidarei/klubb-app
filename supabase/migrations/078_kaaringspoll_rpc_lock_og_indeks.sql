-- To rettelser etter Copilot-review på #87:
--
--  1. Lås EXECUTE på avslutt_kaaringspoll() ned til service_role.
--     RPC-en kjøres kun fra cron (lib/actions/paaminnelser.ts), som bruker
--     service_role-klienten. Tidligere lå grant på `authenticated`, hvilket
--     betyr at hvilken som helst innlogget bruker kunne forhåndskalle den
--     på en moden poll. Etterpå ville cron skippe pga `avsluttet_paa is not
--     null` → ingen vinner-/tiebreak-varsel ble sendt. velgTiebreakVinner
--     i app-koden bruker IKKE denne RPC-en — den skriver direkte til
--     kaaring_vinnere — så app-flyten påvirkes ikke.
--
--  2. Partial-indeks på poll(arrangement_id, svarfrist desc) for å støtte
--     arrangement-detaljsidens lookup `.eq('arrangement_id', id)`. Speiler
--     mønsteret fra poll_kaaring_aapne i 072.

revoke execute on function avslutt_kaaringspoll(uuid) from authenticated;
revoke execute on function avslutt_kaaringspoll(uuid) from public;
grant execute on function avslutt_kaaringspoll(uuid) to service_role;

create index if not exists poll_arrangement_id_idx
  on poll (arrangement_id, svarfrist desc)
  where arrangement_id is not null;

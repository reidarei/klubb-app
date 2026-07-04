-- Kaldstart-diagnostikk (#391): FCP/LCP-halen på mobil skyldes klientside-
-- kostnader, men vitals-loggen kan ikke skille «cachen var kastet» (iOS
-- rydder PWA-cache etter inaktivitet) fra «treg link» fra «PWA-oppstart».
-- To nye felter fra PerformanceNavigationTiming gir svaret:
--
--   nav_type      — navigasjonstype ('navigate' = kald/vanlig åpning,
--                   'reload', 'back_forward', 'prerender')
--   transfer_size — bytes overført for HTML-dokumentet; 0 = servert fra
--                   cache (SW/HTTP) → cache-varm start. > 0 = nettverket
--                   ble brukt → kald.
--
-- Begge nullable — eldre klienter (gamle SW-versjoner) sender dem ikke.

alter table public.vitals_logg
  add column nav_type text check (nav_type in ('navigate', 'reload', 'back_forward', 'prerender')),
  add column transfer_size double precision check (transfer_size >= 0);

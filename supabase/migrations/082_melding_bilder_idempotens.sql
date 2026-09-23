-- Oppfølging av migrasjon 081 etter Copilot-review på PR #177:
--   - Unique constraint på (melding_id, rekkefoelge) gjør melding_bilder
--     idempotent. Re-import av samme FB-post legger ikke til duplikat-rader.
--   - UPDATE-grant uten matching RLS-policy ble flagget som forvirrende —
--     enten gi policy eller fjerne grant. Vi fjerner grant: bilder skal
--     normalt ikke endres in-place, kun slettes og re-opprettes (cascade
--     fjerner via meldingen). Hvis vi senere trenger reorder, legges
--     UPDATE-policy inn samtidig.

alter table public.melding_bilder
  add constraint melding_bilder_melding_rekkefoelge_unique
  unique (melding_id, rekkefoelge);

-- Fjerner UPDATE fra authenticated. service_role beholder full tilgang
-- (bypasses RLS uansett, men trenger eksplisitt grant for PostgREST).
revoke update on public.melding_bilder from authenticated;

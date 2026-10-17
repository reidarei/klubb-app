// Klubben for systemjobber uten innlogget forespørsel (cron, webhook) — #871.
//
// Egen modul, ikke lib/klubb-kontekst.ts: den dekoder et uverifisert access-token og må
// aldri nås fra ruter som middleware slipper forbi (__tests__/klubb-kontekst-middleware.test.ts).
// Cron og webhook ER slike ruter, og klubbForSystemjobb() trenger ingen sesjon.

// Standardklubbens id — samme uuid som standard_klubb_id() i 161_klubb_id.sql
// (pinnet via __tests__/klubb-kontekst.test.ts, som sjekker at aktivKlubbId() returnerer den).
export const STANDARD_KLUBB_ID = '00000000-0000-4000-a000-000000000001'

/**
 * Klubben for systemjobber (cron, webhook) som ikke har noen innlogget forespørsel.
 *
 * MIDLERTIDIG fase 1-valg: det finnes bare én klubb, så jobbene kjører mot
 * standardklubben. 2.5 (#872) erstatter dette med iterasjon over `klubb`.
 * Skal kun brukes i app/api/cron/**, github/webhook og cron-drevne actions.
 */
export function klubbForSystemjobb(): string {
  return STANDARD_KLUBB_ID
}

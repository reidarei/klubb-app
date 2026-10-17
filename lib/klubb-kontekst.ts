import 'server-only'

// Standardklubbens id — samme uuid som standard_klubb_id() i 161_klubb_id.sql
// (pinnet i __tests__/klubb-kontekst.test.ts). Bevisst IKKE eksportert: all
// kode går via aktivKlubbId(), så det finnes ett sted å bytte kilde.
const STANDARD_KLUBB_ID = '00000000-0000-4000-a000-000000000001'

/**
 * Hvilken klubb en innlogget forespørsel gjelder (#868, B1-kontrakten).
 *
 * I dag alltid standardklubben. Byttes til JWT-claim i 2.2 og kan da bli
 * async — derfor en funksjon og ikke en konstant. Service-role, cron og
 * `sendVarsel()` har ingen innlogget forespørsel og tar `klubbId`
 * eksplisitt fra 2.4.
 */
export function aktivKlubbId(): string {
  return STANDARD_KLUBB_ID
}

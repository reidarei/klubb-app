// Delt klassifisering av tabellene i public mot klubb_id (multi-tenant 1.2, #865).
// Brukes av migrasjonsvakten og av 1.3. Ligger under __tests__/helpers fordi
// synk-skriptet dekker __tests__ men ikke resten av supabase/.
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type UnntaksKlasse = 'rot' | 'global' | 'venter_2_1'

// Tabeller som bevisst IKKE har klubb_id. Speiles i unntakslista i psql-steget
// i .github/workflows/pr-check.yml (vaktet av migrasjon-klubb-id.test.ts).
export const KLUBB_ID_UNNTAK = [
  { tabell: 'klubb', klasse: 'rot', begrunnelse: 'Roten selv.' },
  { tabell: 'profiles', klasse: 'global', begrunnelse: 'Personen er global; rolle og faar_* flyttes til medlemskap i 2.1.', issue: 868 },
  { tabell: 'push_subscriptions', klasse: 'global', begrunnelse: 'Per enhet: samme telefon skal få varsler fra alle klubbene.', issue: 868 },
  { tabell: 'pass_info', klasse: 'global', begrunnelse: 'Passet tilhører personen; klubbkonteksten bor i pass_tilgang_forespørsel.', issue: 868 },
  { tabell: 'varsel_preferanser', klasse: 'venter_2_1', begrunnelse: 'Tilhører medlemskapet; PK byttes i 2.1.', issue: 868 },
  { tabell: 'posisjon_deling', klasse: 'venter_2_1', begrunnelse: 'Tilhører medlemskapet; PK byttes i 2.1.', issue: 868 },
  { tabell: 'posisjon_punkt', klasse: 'venter_2_1', begrunnelse: 'Nullable arrangement_id: ingen sann klubb før medlemskap finnes i 2.1.', issue: 868 },
] as const

// Alle tabellnavn under public.Tables i de genererte typene. En ny tabell
// dukker dermed opp her og tvinger en bevisst klassifisering.
export function tabellerFraTyper(): string[] {
  const kilde = readFileSync(path.resolve(__dirname, '../../lib/supabase/database.types.ts'), 'utf-8').replace(/\r\n/g, '\n')
  const start = kilde.indexOf('  public: {')
  const fra = kilde.indexOf('Tables: {', start)
  const til = kilde.indexOf('Views: {', fra)
  if (start < 0 || fra < 0 || til < 0) throw new Error('Fant ikke public.Tables i database.types.ts')
  const blokk = kilde.slice(fra, til)
  // Seks mellomrom: tabellnavn står ett nivå under Tables (u-flagget for æøå).
  return [...blokk.matchAll(/^ {6}([a-zæøå_]+): \{$/gmu)].map(m => m[1])
}

export function klubbeideTabeller(): string[] {
  const unntak = new Set<string>(KLUBB_ID_UNNTAK.map(u => u.tabell))
  return tabellerFraTyper().filter(t => !unntak.has(t))
}

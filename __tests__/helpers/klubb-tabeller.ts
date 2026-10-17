// Delt klassifisering av tabellene i public mot klubb_id (multi-tenant 1.2, #865).
// Brukes av migrasjonsvakten og av 1.3. Ligger under __tests__/helpers fordi
// synk-skriptet dekker __tests__ men ikke resten av supabase/.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { byggSkjema, lesMigrasjoner } from './migrasjon-skjema'

export type UnntaksKlasse = 'rot' | 'global' | 'venter_2_1'

// Tabeller som bevisst IKKE har klubb_id. Speiles i unntakslista i psql-steget
// i .github/workflows/pr-check.yml (vaktet av migrasjon-klubb-id.test.ts).
export const KLUBB_ID_UNNTAK = [
  { tabell: 'klubb', klasse: 'rot', begrunnelse: 'Roten selv.' },
  { tabell: 'profiles', klasse: 'global', begrunnelse: 'Personen er global. rolle/aktiv/faar_*/bursdagsgratulasjon_aktiv er et skrivebeskyttet speil av medlemskap til PR C (#868).', issue: 868 },
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

// Kilde er migrasjonene (sannheten); typene er kun kryssjekk i skjemavakt-klubb.test.ts,
// fordi de regenereres først etter merge.
export function klubbeideTabeller(): string[] {
  const unntak = new Set<string>(KLUBB_ID_UNNTAK.map(u => u.tabell))
  return [...byggSkjema(lesMigrasjoner()).tabeller.keys()].filter(t => !unntak.has(t))
}

// Klubbeide tabeller med bevisst nullable klubb_id. feil_logg registreres her i 2.4b (#896).
export const KLUBB_ID_NULLABLE: readonly { tabell: string; begrunnelse: string; issue: number }[] = []

// Klubbeide tabeller som ennå ikke har en RLS-policy som refererer klubb_id.
// 2.3 (#870) tømmer lista. Nye tabeller får aldri legges hit.
export const KLUBB_UTEN_KLUBB_POLICY: readonly string[] = [
  'aktivitet_dag',
  'aktivitet_uke',
  'album',
  'album_bilde',
  'album_bilde_chat',
  'album_bilde_reaksjon',
  'app_innstillinger',
  'arrangement_chat',
  'arrangementer',
  'arrangementmaler',
  'arrangoransvar',
  'bursdagsbilde',
  'chat_reaksjoner',
  'feil_logg',
  'fond_bevegelse',
  'fond_eiendom',
  'fond_innskudd',
  'fond_kontant',
  'fond_navn_alias',
  'fond_verdi_historikk',
  'fond_verdipapir',
  'innspill_kobling',
  'kaaring_vinnere',
  'kaaringmaler',
  'kart_markering',
  'kart_symbol_tilpasning',
  'klubb_chat',
  'klubb_info',
  'melding_bilder',
  'melding_chat',
  'melding_reaksjon',
  'meldinger',
  'paameldinger',
  'pass_tilgang_forespørsel',
  'poll',
  'poll_chat',
  'poll_stemme',
  'poll_valg',
  'samtale',
  'samtale_chat',
  'timeplan_post',
  'varsel_innstillinger',
  'varsel_logg',
  'vedtekter',
  'vedtekter_versjoner',
  'vitals_logg',
]

// FK mot klubb uten indeks med klubb_id først. Barne-indekser kommer i 2.1b (#895),
// 2.3 og 6.2 (#886). Nye tabeller FÅR legges hit (synlig, kjent liste).
export const KLUBB_FK_UTEN_STOETTEINDEKS: readonly string[] = [
  'album_bilde',
  'album_bilde_chat',
  'album_bilde_reaksjon',
  'arrangement_chat',
  'arrangementmaler',
  'fond_bevegelse',
  'fond_eiendom',
  'fond_innskudd',
  'fond_verdi_historikk',
  'fond_verdipapir',
  'kaaringmaler',
  'melding_bilder',
  'melding_chat',
  'melding_reaksjon',
  'paameldinger',
  'pass_tilgang_forespørsel',
  'poll_chat',
  'poll_stemme',
  'poll_valg',
  'samtale_chat',
  'timeplan_post',
  'varsel_logg',
  'vedtekter_versjoner',
]

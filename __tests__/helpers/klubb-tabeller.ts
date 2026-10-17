// Delt klassifisering av tabellene i public mot klubb_id (multi-tenant 1.2, #865).
// Brukes av migrasjonsvakten og av 1.3. Ligger under __tests__/helpers fordi
// synk-skriptet dekker __tests__ men ikke resten av supabase/.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { byggSkjema, lesMigrasjoner } from './migrasjon-skjema'

export type UnntaksKlasse = 'rot' | 'global'

// Tabeller som bevisst IKKE har klubb_id. Speiles i unntakslista i psql-steget
// i .github/workflows/pr-check.yml (vaktet av migrasjon-klubb-id.test.ts).
export const KLUBB_ID_UNNTAK = [
  { tabell: 'klubb', klasse: 'rot', begrunnelse: 'Roten selv.' },
  { tabell: 'profiles', klasse: 'global', begrunnelse: 'Personen er global. rolle/aktiv/faar_*/bursdagsgratulasjon_aktiv er et skrivebeskyttet speil av medlemskap til PR C (#868).', issue: 868 },
  { tabell: 'push_subscriptions', klasse: 'global', begrunnelse: 'Per enhet: samme telefon skal få varsler fra alle klubbene.', issue: 868 },
  { tabell: 'pass_info', klasse: 'global', begrunnelse: 'Passet tilhører personen; klubbkonteksten bor i pass_tilgang_forespørsel.', issue: 868 },
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
// Tom siden 2.3 (#870) (mig. 167). Lista kan bare krympe: nye tabeller får aldri legges her,
// og en tabell som noen gang har hatt en klubb-policy kan ikke føres tilbake.
export const KLUBB_UTEN_KLUBB_POLICY: readonly string[] = []

// FK mot klubb uten indeks med klubb_id først. 2.1b (#895) ga album_bilde, kaaringmaler og
// poll_valg en (klubb_id, id)-nøkkel; resten venter på 6.2 (#886). Nye tabeller FÅR legges hit (synlig, kjent liste).
export const KLUBB_FK_UTEN_STOETTEINDEKS: readonly string[] = [
  'album_bilde_chat',
  'album_bilde_reaksjon',
  'arrangement_chat',
  'arrangementmaler',
  'fond_bevegelse',
  'fond_eiendom',
  'fond_innskudd',
  'fond_verdi_historikk',
  'fond_verdipapir',
  'melding_bilder',
  'melding_chat',
  'melding_reaksjon',
  'paameldinger',
  'pass_tilgang_forespørsel',
  'poll_chat',
  'poll_stemme',
  'posisjon_punkt',
  'samtale_chat',
  'timeplan_post',
  'varsel_logg',
  'vedtekter_versjoner',
]

// Forelder-tabellene som fikk unique (klubb_id, id) i mig. 165 (#895): mål for de 30
// sammensatte FK-ene (klubb_id, x) → forelder(klubb_id, id).
export const FORELDRE_MED_KLUBB_NOEKKEL = [
  'arrangementer',
  'poll',
  'album_bilde',
  'meldinger',
  'kaaringmaler',
  'album',
  'samtale',
  'poll_valg',
  'vedtekter',
] as const

// Profilkolonner på klubbeide tabeller som BEVISST ikke har FK mot medlemskap(klubb_id, profil_id):
// de peker på personen (hvem som handlet), ikke på medlemskapet raden tilhører.
// Speilet i unntakslista i steget «Verifiser sammensatte fremmednøkler» i pr-check.yml (vaktet av migrasjon-165.test.ts).
// En NY profilkolonne der personen deltar i klubben skal ha medlemskap-FK; ellers føres den hit.
export const PROFIL_FK_BARE_PERSON = [
  { kolonne: 'pass_tilgang_forespørsel.besluttet_av', begrunnelse: 'Hvem som avgjorde forespørselen; kan ha forlatt klubben.' },
  { kolonne: 'bursdagsbilde.slettet_av', begrunnelse: 'Hvem som slettet bildet; en historikkmarkør.' },
  { kolonne: 'feil_logg.profil_id', begrunnelse: 'Drifts-logg; klubb_id er nullable og raden skal overleve medlemskapet.' },
  { kolonne: 'fond_navn_alias.opprettet_av', begrunnelse: 'Hvem som la inn aliaset; en historikkmarkør.' },
  { kolonne: 'fond_verdi_historikk.endret_av', begrunnelse: 'Hvem som endret verdien; en historikkmarkør.' },
  { kolonne: 'vedtekter_versjoner.endret_av', begrunnelse: 'Hvem som endret vedtekten; en historikkmarkør.' },
  { kolonne: 'varsel_logg.profil_id', begrunnelse: 'Innboksen: raden skal overleve at medlemskapet avsluttes.' },
  { kolonne: 'push_subscriptions.profil_id', begrunnelse: 'Per enhet, ikke per klubb (global tabell).' },
  { kolonne: 'pass_info.profil_id', begrunnelse: 'Passet tilhører personen (global tabell).' },
  { kolonne: 'medlemskap.profil_id', begrunnelse: 'Selve medlemskapet; FK mot profiles er rota.' },
] as const

// Konstanter i lib/konstanter.ts som speiler DB-regler, sjekket mot
// migrasjonsfilene (#851). Siste migrasjon som definerer en regel vinner, så
// en ny migrasjon som endrer grensen uten at konstanten følger (eller omvendt)
// feiler her. Leser SQL-teksten, ikke en kjørende database.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  CHAT_MIN_LENGDE,
  CHAT_MAKS_LENGDE,
  INNLEGG_MIN_LENGDE,
  INNLEGG_MAKS_LENGDE,
  STIKKORD_MAKS_LENGDE,
  MATALLERGIER_MAKS_LENGDE,
  KART_MARKERING_MAKS_LENGDE,
  KART_SYMBOL_NAVN_MAKS,
  KART_SYMBOL_EMOJI_MAKS,
  KLUBB_STED_MAKS,
  KLUBB_OM_MAKS,
  TIMEPLAN_TEKST_MAKS_LENGDE,
  TIMEPLAN_ADRESSE_MAKS_LENGDE,
  BURSDAGSBILDE_LEASE_MIN,
  BURSDAGSBILDE_TVING_LEASE_SEK,
  BURSDAGSBILDE_MAKS_FORSOK,
} from '@/lib/konstanter'

const MIGRASJONER = path.resolve(__dirname, '../supabase/migrations')

// Sortert på filnavn = kjørerekkefølge (NNN_navn.sql).
const filer = readdirSync(MIGRASJONER)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => ({ navn: f, sql: readFileSync(path.join(MIGRASJONER, f), 'utf-8') }))

function utenKommentarer(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

// Funksjonskropper ($$ … $$ / $tag$ … $tag$) fjernes før vi splitter på «;»,
// ellers ville et semikolon inne i en funksjon delt setningen.
function utenFunksjonskropper(sql: string): string {
  return sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''")
}

type Grense = { min: number; maks: number; fil: string }

// tabell.kolonne → siste lengdegrense («char_length(...) between a and b»).
// Dekker både inline-check i create table og alter table … add constraint.
const lengdegrenser = new Map<string, Grense>()
for (const { navn, sql } of filer) {
  for (const setning of utenFunksjonskropper(utenKommentarer(sql)).split(';')) {
    const tabell = setning.match(/^\s*(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/i)?.[1]
    if (!tabell) continue
    const re = /(?:char_)?length\(\s*(?:btrim\(\s*)?(\w+)\s*\)?\s*\)\s+between\s+(\d+)\s+and\s+(\d+)/gi
    for (const m of setning.matchAll(re)) {
      lengdegrenser.set(`${tabell}.${m[1]}`, { min: Number(m[2]), maks: Number(m[3]), fil: navn })
    }
  }
}

describe('tegnegrenser i lib/konstanter.ts speiler DB check-constraints', () => {
  it.each([
    ['arrangement_chat.innhold', CHAT_MIN_LENGDE, CHAT_MAKS_LENGDE],
    ['klubb_chat.innhold', CHAT_MIN_LENGDE, CHAT_MAKS_LENGDE],
    ['poll_chat.innhold', CHAT_MIN_LENGDE, CHAT_MAKS_LENGDE],
    ['melding_chat.innhold', CHAT_MIN_LENGDE, CHAT_MAKS_LENGDE],
    ['album_bilde_chat.innhold', CHAT_MIN_LENGDE, CHAT_MAKS_LENGDE],
    // Privat chat bruker innleggsgrensen (lib/chat-konfig.ts).
    ['samtale_chat.innhold', INNLEGG_MIN_LENGDE, INNLEGG_MAKS_LENGDE],
    ['meldinger.innhold', INNLEGG_MIN_LENGDE, INNLEGG_MAKS_LENGDE],
    ['profiles.stikkord', 1, STIKKORD_MAKS_LENGDE],
    ['profiles.matallergier', 1, MATALLERGIER_MAKS_LENGDE],
    ['kart_markering.tekst', 1, KART_MARKERING_MAKS_LENGDE],
    ['kart_symbol_tilpasning.etikett', 1, KART_SYMBOL_NAVN_MAKS],
    ['kart_symbol_tilpasning.emoji', 1, KART_SYMBOL_EMOJI_MAKS],
    ['klubb_info.sted', 1, KLUBB_STED_MAKS],
    ['klubb_info.om_tekst', 1, KLUBB_OM_MAKS],
    ['timeplan_post.tekst', 1, TIMEPLAN_TEKST_MAKS_LENGDE],
    ['timeplan_post.adresse', 1, TIMEPLAN_ADRESSE_MAKS_LENGDE],
  ])('%s', (kolonne, min, maks) => {
    const grense = lengdegrenser.get(kolonne)
    expect(grense, `fant ingen lengde-check for ${kolonne} i migrasjonene`).toBeDefined()
    expect({ min: grense!.min, maks: grense!.maks }, `siste definisjon: ${grense!.fil}`).toEqual({ min, maks })
  })
})

describe('bursdagsbilde-lease speiler krev_bursdagsbilde()', () => {
  // Siste create or replace vinner.
  const definisjoner = filer.flatMap(({ sql }) =>
    [...utenKommentarer(sql).matchAll(
      /create\s+or\s+replace\s+function\s+(?:public\.)?krev_bursdagsbilde\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi,
    )].map(m => m[1]),
  )
  const kropp = definisjoner.at(-1) ?? ''

  it('funksjonen finnes', () => {
    expect(kropp).not.toBe('')
  })

  // Én forekomst hver: en ny enhet (f.eks. «600 seconds») skal feile, ikke
  // stille ignoreres.
  it('tvungen lease = BURSDAGSBILDE_TVING_LEASE_SEK', () => {
    const treff = [...kropp.matchAll(/interval\s+'(\d+)\s+seconds?'/gi)].map(m => Number(m[1]))
    expect(treff).toEqual([BURSDAGSBILDE_TVING_LEASE_SEK])
  })

  it('hengende lease = BURSDAGSBILDE_LEASE_MIN', () => {
    const treff = [...kropp.matchAll(/interval\s+'(\d+)\s+minutes?'/gi)].map(m => Number(m[1]))
    expect(treff).toEqual([BURSDAGSBILDE_LEASE_MIN])
  })

  it('forsøkstak = BURSDAGSBILDE_MAKS_FORSOK', () => {
    const treff = [...kropp.matchAll(/forsok\s*<\s*(\d+)/gi)].map(m => Number(m[1]))
    expect(treff).toEqual([BURSDAGSBILDE_MAKS_FORSOK])
  })
})

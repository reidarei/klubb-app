// Ren parser som bygger opp skjemaet i `public` fra migrasjonsfilene (multi-tenant 1.3, #866).
// Ingen database og ingen vitest-import: migrasjonene er sannheten, de genererte
// typene er kun en kryssjekk (typene regenereres først ETTER merge).
//
// Blindsoner, presise og kjente (samme filosofi som hk/dato-tidssone-uavhengig):
//  (a) Dollar-quotede kropper (do $$ … $$, funksjoner) strippes helt, så en policy
//      laget i `do $$`/`execute` er usynlig. Skriv den som vanlig DDL. For TABELLER
//      feiler vi lukket i stedet: hvert `create table` i råteksten (også inni
//      dollar-quotes og strenger) må svare til en gjenkjent setning, ellers havner
//      fila i `ukjentTabellDdl` og vakten blir rød. Dekker også `create table … as`,
//      `partition of`, `unlogged`/`temp`. Ikke dekket: `select … into <ny tabell>`.
//  (b) `--` strippes uten hensyn til strengliteraler; en `--` inni en tekst-literal
//      kutter resten av linja. Ingen migrasjon har det i dag.
//  (c) «Policyen refererer klubb_id» er et ordtreff, ikke en semantisk sjekk: den
//      beviser ikke at policyen faktisk avgrenser til riktig klubb.
//  (d) Kun én navngitt tabell per setning; `alter policy` og `rename` av tabell og
//      policy følges, men ikke `alter table … rename column`.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type MigrasjonsFil = { fil: string; sql: string }

export type TabellTilstand = {
  opprettetI: string
  klubbId: null | { nullable: boolean; fil: string }
  policyer: Map<string, { fil: string; tekst: string }>
  klubbIdIndekser: Set<string>
}

export type Skjema = {
  tabeller: Map<string, TabellTilstand>
  nogensinneOpprettet: Set<string>
  // Tabeller som på et tidspunkt har hatt en policy som refererer klubb_id. Brukes til
  // å hindre at en tabell som har vært ferdig føres tilbake på KLUBB_UTEN_KLUBB_POLICY.
  nogensinneKlubbPolicy: Set<string>
  policyAdvarsler: string[]
  // Filer der antall `create table` i råteksten ikke stemmer med de gjenkjente.
  ukjentTabellDdl: string[]
}

const MIGRASJONSMAPPE = path.resolve(__dirname, '../../supabase/migrations')

// tilOgMed: filtrerer på nummerprefikset (161 = alt til og med migrasjon 161).
export function lesMigrasjoner(tilOgMed?: number): MigrasjonsFil[] {
  return readdirSync(MIGRASJONSMAPPE)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => tilOgMed === undefined || parseInt(f, 10) <= tilOgMed)
    .map(f => ({ fil: f, sql: readFileSync(path.join(MIGRASJONSMAPPE, f), 'utf-8') }))
}

export function refererKlubbId(tekst: string): boolean {
  return /\bklubb_id\b/.test(tekst)
}

// Alle former for tabellopprettelse, også de parseren ikke forstår. Telles i råteksten
// før dollar-quotes strippes, så `execute 'create table …'` ikke blir usynlig.
const R_ALLE_CREATE_TABLE = /\bcreate\s+(?:(?:global|local|temp|temporary|unlogged)\s+)*table\b/gi

function utenKommentarer(sql: string): string {
  return sql.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function normaliser(sql: string): string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, '$$$$')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .toLowerCase()
    .split(';')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// Valgfritt schema + valgfrie anførselstegn rundt navnet.
const NAVN = String.raw`(?:(\w+)\.)?"?([a-zæøå_0-9]+)"?`
const re = (kilde: string) => new RegExp(kilde, 'u')

const R_CREATE_TABLE = re(String.raw`^create table (?:if not exists )?${NAVN} ?\(`)
const R_DROP_TABLE = re(String.raw`^drop table (?:if exists )?${NAVN}`)
const R_RENAME = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} rename to "?([a-zæøå_0-9]+)"?$`)
const R_ADD_KOLONNE = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} add column (?:if not exists )?klubb_id uuid( not null)?.*?references public\.klubb ?\(id\)`)
const R_DROP_NOT_NULL = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} alter column klubb_id drop not null`)
const R_SET_NOT_NULL = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} alter column klubb_id set not null`)
const R_DROP_KOLONNE = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} drop column (?:if exists )?klubb_id\b`)
const R_ADD_NOKKEL = re(String.raw`^alter table (?:if exists )?(?:only )?${NAVN} add (?:constraint \S+ )?(?:primary key|unique) ?\(klubb_id\b`)
const R_CREATE_INDEX = re(String.raw`^create (?:unique )?index (?:concurrently )?(?:if not exists )?(\S+) on (?:only )?${NAVN} (?:using \w+ )?\(klubb_id\b`)
const R_DROP_INDEX = re(String.raw`^drop index (?:concurrently )?(?:if exists )?(?:\w+\.)?(\S+)`)
const R_CREATE_POLICY = re(String.raw`^create policy "([^"]+)" on ${NAVN}`)
const R_ALTER_POLICY = re(String.raw`^alter policy "([^"]+)" on ${NAVN}(?: rename to "([^"]+)")?`)
const R_DROP_POLICY = re(String.raw`^drop policy (if exists )?"([^"]+)" on ${NAVN}`)

const erPublic = (schema: string | undefined) => schema === undefined || schema === 'public'

export function byggSkjema(filer: MigrasjonsFil[]): Skjema {
  const tabeller = new Map<string, TabellTilstand>()
  const nogensinneOpprettet = new Set<string>()
  const nogensinneKlubbPolicy = new Set<string>()
  const policyAdvarsler: string[] = []
  const ukjentTabellDdl: string[] = []
  const tabellFor = (schema: string | undefined, navn: string) => (erPublic(schema) ? tabeller.get(navn) : undefined)

  for (const { fil, sql } of filer) {
    const treff = utenKommentarer(sql).match(R_ALLE_CREATE_TABLE)?.length ?? 0
    let gjenkjent = 0
    for (const s of normaliser(sql)) {
      let m: RegExpExecArray | null

      if ((m = R_CREATE_TABLE.exec(s))) {
        gjenkjent++
        if (!erPublic(m[1])) continue
        // `if not exists` på en tabell som finnes er en no-op i Postgres: behold tilstanden.
        if (s.startsWith('create table if not exists ') && tabeller.has(m[2])) continue
        const t: TabellTilstand = { opprettetI: fil, klubbId: null, policyer: new Map(), klubbIdIndekser: new Set() }
        const inline = /\bklubb_id uuid( not null)?\b[^,]*\breferences public\.klubb ?\(id\)/.exec(s)
        if (inline) t.klubbId = { nullable: !inline[1], fil }
        if (/(?:primary key|unique) ?\(klubb_id\b/.test(s)) t.klubbIdIndekser.add('(inline)')
        tabeller.set(m[2], t)
        nogensinneOpprettet.add(m[2])
      } else if ((m = R_DROP_TABLE.exec(s))) {
        if (erPublic(m[1])) tabeller.delete(m[2])
      } else if ((m = R_RENAME.exec(s))) {
        const t = tabellFor(m[1], m[2])
        if (t) {
          tabeller.delete(m[2])
          tabeller.set(m[3], t)
          nogensinneOpprettet.add(m[3])
          if (nogensinneKlubbPolicy.has(m[2])) nogensinneKlubbPolicy.add(m[3])
        }
      } else if ((m = R_ADD_KOLONNE.exec(s))) {
        const t = tabellFor(m[1], m[2])
        if (t) t.klubbId = { nullable: !m[3], fil }
      } else if ((m = R_DROP_NOT_NULL.exec(s))) {
        const t = tabellFor(m[1], m[2])
        if (t?.klubbId) t.klubbId = { ...t.klubbId, nullable: true }
      } else if ((m = R_SET_NOT_NULL.exec(s))) {
        const t = tabellFor(m[1], m[2])
        if (t?.klubbId) t.klubbId = { ...t.klubbId, nullable: false }
      } else if ((m = R_DROP_KOLONNE.exec(s))) {
        const t = tabellFor(m[1], m[2])
        if (t) t.klubbId = null
      } else if ((m = R_ADD_NOKKEL.exec(s))) {
        tabellFor(m[1], m[2])?.klubbIdIndekser.add('(nokkel)')
      } else if ((m = R_CREATE_INDEX.exec(s))) {
        tabellFor(m[2], m[3])?.klubbIdIndekser.add(m[1])
      } else if ((m = R_DROP_INDEX.exec(s))) {
        for (const t of tabeller.values()) t.klubbIdIndekser.delete(m[1])
      } else if ((m = R_CREATE_POLICY.exec(s))) {
        const t = tabellFor(m[2], m[3])
        if (!t) continue
        t.policyer.set(m[1], { fil, tekst: s })
        if (refererKlubbId(s)) nogensinneKlubbPolicy.add(m[3])
      } else if ((m = R_ALTER_POLICY.exec(s))) {
        const t = tabellFor(m[2], m[3])
        if (!t) continue
        const gammel = t.policyer.get(m[1])
        if (!gammel) {
          policyAdvarsler.push(`${fil}: alter policy "${m[1]}" på ${m[3]} uten kjent policy`)
          continue
        }
        if (m[4]) {
          t.policyer.delete(m[1])
          t.policyer.set(m[4], gammel)
        } else {
          t.policyer.set(m[1], { fil, tekst: s })
          if (refererKlubbId(s)) nogensinneKlubbPolicy.add(m[3])
        }
      } else if ((m = R_DROP_POLICY.exec(s))) {
        const t = tabellFor(m[3], m[4])
        if (!t) continue
        if (!t.policyer.delete(m[2]) && !m[1]) {
          policyAdvarsler.push(`${fil}: drop policy "${m[2]}" på ${m[4]} uten if exists, men policyen finnes ikke`)
        }
      }
    }
    if (treff !== gjenkjent) {
      ukjentTabellDdl.push(`${fil}: ${treff} create table i teksten, ${gjenkjent} gjenkjent som vanlig \`create table <navn> (\``)
    }
  }
  return { tabeller, nogensinneOpprettet, nogensinneKlubbPolicy, policyAdvarsler, ukjentTabellDdl }
}

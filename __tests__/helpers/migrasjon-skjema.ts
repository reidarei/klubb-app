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
//      beviser ikke at policyen faktisk avgrenser til riktig klubb. Det gjør
//      `harKlubbledd()` per klausul (using/with check hver for seg, #870), men heller ikke
//      den ser hva resten av uttrykket gjør; atferden vaktes av CI-steget «Verifiser klubb-RLS».
//  (d) Kun én navngitt tabell per setning; `alter policy` og `rename` av tabell og
//      policy følges, men ikke `alter table … rename column`.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type MigrasjonsFil = { fil: string; sql: string }

// Policyens effektive tilstand etter alle create/alter. `alter policy` endrer bare klausulene
// den nevner (Postgres beholder resten), så kommandoen kommer alltid fra `create policy`.
export type PolicyKommando = 'all' | 'select' | 'insert' | 'update' | 'delete'
export type PolicyTilstand = {
  fil: string
  tekst: string // siste setning som rørte policyen (create eller alter)
  kommando: PolicyKommando
  roller: string | null // `to …`, null = ikke oppgitt (public)
  using: string | null // innholdet i using (…), uten ytterste parentes
  withCheck: string | null
}

export type TabellTilstand = {
  opprettetI: string
  klubbId: null | { nullable: boolean; fil: string }
  policyer: Map<string, PolicyTilstand>
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

// Policyer på klubbeide tabeller skal bruke initplan-formen (#870): aktiv_klubb() er security
// definer og inlines aldri, så uten select-pakken kalles den per rad.
export function refererAktivKlubb(tekst: string): boolean {
  return /\(select public\.aktiv_klubb\(\)\)/.test(tekst)
}

// Finner `<nøkkelord> (` på parentesnivå 0 (utenfor strenger) og returnerer innholdet i den
// balanserte parentesen. null = klausulen finnes ikke i setningen.
function klausul(s: string, noekkelord: string): string | null {
  let dybde = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      const slutt = s.indexOf("'", i + 1)
      i = slutt < 0 ? s.length : slutt
    } else if (c === '(') dybde++
    else if (c === ')') dybde--
    else if (dybde === 0 && s.startsWith(` ${noekkelord} (`, i)) {
      const start = i + noekkelord.length + 3
      let d = 1
      for (let j = start; j < s.length; j++) {
        if (s[j] === "'") {
          const slutt = s.indexOf("'", j + 1)
          j = slutt < 0 ? s.length : slutt
        } else if (s[j] === '(') d++
        else if (s[j] === ')' && --d === 0) return s.slice(start, j).trim()
      }
      return null
    }
  }
  return null
}

// Deler et uttrykk på `operator` på parentesnivå 0 (utenfor strenger).
function delToppnivaa(uttrykk: string, operator: 'and' | 'or'): string[] {
  const deler: string[] = []
  let dybde = 0
  let start = 0
  for (let i = 0; i < uttrykk.length; i++) {
    const c = uttrykk[i]
    if (c === "'") {
      const slutt = uttrykk.indexOf("'", i + 1)
      i = slutt < 0 ? uttrykk.length : slutt
    } else if (c === '(') dybde++
    else if (c === ')') dybde--
    else if (dybde === 0 && uttrykk.startsWith(` ${operator} `, i)) {
      deler.push(uttrykk.slice(start, i))
      start = i + operator.length + 2
    }
  }
  deler.push(uttrykk.slice(start))
  return deler.map(d => d.trim())
}

// Fjerner parenteser som omslutter HELE uttrykket: `((a and b))` → `a and b`.
function utenYtrePar(uttrykk: string): string {
  let u = uttrykk.trim()
  while (u.startsWith('(') && u.endsWith(')')) {
    let d = 0
    let omslutter = true
    for (let i = 0; i < u.length - 1; i++) {
      if (u[i] === '(') d++
      else if (u[i] === ')') d--
      if (d === 0) { omslutter = false; break }
    }
    if (!omslutter) break
    u = u.slice(1, -1).trim()
  }
  return u
}

const KLUBBLEDD = 'klubb_id = (select public.aktiv_klubb())'

// Klubbleddet (#870) som obligatorisk konjunkt på toppnivå: `klubb_id = (select public.aktiv_klubb())
// and …`. Et `or` på toppnivå gjør leddet valgfritt (and binder sterkere), så det er rødt.
export function harKlubbledd(uttrykk: string | null): boolean {
  if (uttrykk === null) return false
  const u = utenYtrePar(uttrykk)
  if (delToppnivaa(u, 'or').length > 1) return false
  return delToppnivaa(u, 'and').some(d => utenYtrePar(d) === KLUBBLEDD)
}

// Hvilke klausuler Postgres faktisk bruker for kommandoen. Uten `with check` på ALL/UPDATE
// gjenbrukes `using` som with check; INSERT har ingen using, SELECT/DELETE ingen with check.
export function effektiveKlausuler(p: PolicyTilstand): { using: string | null | undefined; withCheck: string | null | undefined } {
  const brukerUsing = p.kommando !== 'insert'
  const brukerCheck = p.kommando === 'all' || p.kommando === 'insert' || p.kommando === 'update'
  return {
    using: brukerUsing ? p.using : undefined,
    withCheck: brukerCheck ? (p.withCheck ?? (p.kommando === 'insert' ? null : p.using)) : undefined,
  }
}

function roller(s: string): string | null {
  const m = / to (.+?)(?= using \(| with check \(|$)/.exec(s.replace(/^\S+ policy "[^"]+" on \S+/, ''))
  return m ? m[1].trim() : null
}

// er_admin()/er_generalsekretaer() UTEN argument er standardklubben-overlasten (2.4b fjerner den
// fra policyer): policyer skal bruke versjonen med klubb-argument.
export function brukerArgumentlosRolleSjekk(tekst: string): boolean {
  return /\ber_(?:admin|generalsekretaer)\(\s*\)/.test(tekst)
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
        // En partiell indeks (`where …`) dekker ikke FK-sjekken ved `delete from klubb`:
        // raden utenfor predikatet er usynlig for den. Den teller derfor ikke som
        // støtteindeks (#867: varsel_logg og melding_chat har bare partielle).
        if (!/ where /.test(s)) tabellFor(m[2], m[3])?.klubbIdIndekser.add(m[1])
      } else if ((m = R_DROP_INDEX.exec(s))) {
        for (const t of tabeller.values()) t.klubbIdIndekser.delete(m[1])
      } else if ((m = R_CREATE_POLICY.exec(s))) {
        const t = tabellFor(m[2], m[3])
        if (!t) continue
        const kommando = (/ for (all|select|insert|update|delete)\b/.exec(s)?.[1] ?? 'all') as PolicyKommando
        t.policyer.set(m[1], { fil, tekst: s, kommando, roller: roller(s), using: klausul(s, 'using'), withCheck: klausul(s, 'with check') })
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
          // Klausuler som alter ikke nevner, beholder Postgres uendret.
          t.policyer.set(m[1], {
            ...gammel,
            fil,
            tekst: s,
            roller: roller(s) ?? gammel.roller,
            using: klausul(s, 'using') ?? gammel.using,
            withCheck: klausul(s, 'with check') ?? gammel.withCheck,
          })
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

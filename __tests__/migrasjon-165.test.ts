// Statisk vakt for migrasjon 165 (#895, 2.1b): sammensatte fremmednøkler.
// Samme mønster som migrasjon-164.test.ts. Selve virkningen bevises i psql-steget
// «Verifiser sammensatte fremmednøkler» i pr-check.yml; her pinnes formen.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FORELDRE_MED_KLUBB_NOEKKEL, PROFIL_FK_BARE_PERSON } from './helpers/klubb-tabeller'

const RAA = readFileSync(path.resolve(__dirname, '../supabase/migrations/165_sammensatte_fremmednoekler.sql'), 'utf-8').replace(/\r\n/g, '\n')
// Kommentarer fjernes slik at en kommentar som nevner f.eks. «grant» ikke teller.
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const setninger = SQL.split(';').map(flat).filter(Boolean)
const F = flat(SQL)

// [barn, kolonne, forelder, on delete, constraint-navn] — tabellen i planen, rad for rad.
const FORELDER_FK: readonly (readonly [string, string, string, 'cascade' | 'set null' | 'restrict', string])[] = [
  ['album_bilde', 'album_id', 'album', 'cascade', 'album_bilde_album_id_fkey'],
  ['meldinger', 'album_id', 'album', 'set null', 'meldinger_album_id_fkey'],
  ['album', 'cover_bilde_id', 'album_bilde', 'set null', 'album_cover_fk'],
  ['album_bilde_chat', 'album_bilde_id', 'album_bilde', 'cascade', 'album_bilde_chat_album_bilde_id_fkey'],
  ['album_bilde_reaksjon', 'bilde_id', 'album_bilde', 'cascade', 'album_bilde_reaksjon_bilde_id_fkey'],
  ['pass_tilgang_forespørsel', 'arrangement_id', 'arrangementer', 'cascade', 'pass_tilgang_forespørsel_arrangement_id_fkey'],
  ['album', 'arrangement_id', 'arrangementer', 'set null', 'album_arrangement_id_fkey'],
  ['arrangement_chat', 'arrangement_id', 'arrangementer', 'cascade', 'arrangement_chat_arrangement_id_fkey'],
  ['arrangoransvar', 'arrangement_id', 'arrangementer', 'set null', 'arrangoransvar_arrangement_id_fkey'],
  ['kaaring_vinnere', 'arrangement_id', 'arrangementer', 'set null', 'kaaring_vinnere_arrangement_id_fkey'],
  ['kart_markering', 'arrangement_id', 'arrangementer', 'cascade', 'kart_markering_arrangement_id_fkey'],
  ['paameldinger', 'arrangement_id', 'arrangementer', 'cascade', 'paameldinger_arrangement_id_fkey'],
  ['poll', 'arrangement_id', 'arrangementer', 'set null', 'poll_arrangement_id_fkey'],
  ['poll_valg', 'referanse_arrangement_id', 'arrangementer', 'cascade', 'poll_valg_referanse_arrangement_id_fkey'],
  ['posisjon_punkt', 'arrangement_id', 'arrangementer', 'cascade', 'posisjon_punkt_arrangement_id_fkey'],
  ['timeplan_post', 'arrangement_id', 'arrangementer', 'cascade', 'timeplan_post_arrangement_id_fkey'],
  ['varsel_logg', 'arrangement_id', 'arrangementer', 'set null', 'varsel_logg_arrangement_id_fkey'],
  ['kaaring_vinnere', 'mal_id', 'kaaringmaler', 'set null', 'kaaring_vinnere_mal_id_fkey'],
  ['poll', 'kaaring_mal_id', 'kaaringmaler', 'restrict', 'poll_kaaring_mal_id_fkey'],
  ['melding_bilder', 'melding_id', 'meldinger', 'cascade', 'melding_bilder_melding_id_fkey'],
  ['melding_chat', 'melding_id', 'meldinger', 'cascade', 'melding_chat_melding_id_fkey'],
  ['melding_reaksjon', 'melding_id', 'meldinger', 'cascade', 'melding_reaksjon_melding_id_fkey'],
  ['kaaring_vinnere', 'poll_id', 'poll', 'set null', 'kaaring_vinnere_poll_id_fkey'],
  ['poll_chat', 'poll_id', 'poll', 'cascade', 'poll_chat_poll_id_fkey'],
  ['poll_stemme', 'poll_id', 'poll', 'cascade', 'poll_stemme_poll_id_fkey'],
  ['poll_valg', 'poll_id', 'poll', 'cascade', 'poll_valg_poll_id_fkey'],
  ['varsel_logg', 'poll_id', 'poll', 'set null', 'varsel_logg_poll_id_fkey'],
  ['poll_stemme', 'valg_id', 'poll_valg', 'cascade', 'poll_stemme_valg_id_fkey'],
  ['samtale_chat', 'samtale_id', 'samtale', 'cascade', 'samtale_chat_samtale_id_fkey'],
  ['vedtekter_versjoner', 'vedtekt_id', 'vedtekter', 'cascade', 'vedtekter_versjoner_vedtekt_id_fkey'],
]

const MEDLEMSKAP_FK: readonly (readonly [string, string])[] = [
  ['arrangementer', 'opprettet_av'], ['paameldinger', 'profil_id'], ['arrangement_chat', 'profil_id'],
  ['klubb_chat', 'profil_id'], ['chat_reaksjoner', 'profil_id'],
  ['poll', 'opprettet_av'], ['poll_stemme', 'profil_id'], ['poll_chat', 'profil_id'], ['poll_valg', 'referanse_profil_id'],
  ['meldinger', 'profil_id'], ['melding_chat', 'profil_id'], ['melding_reaksjon', 'profil_id'],
  ['samtale', 'profil_a'], ['samtale', 'profil_b'], ['samtale_chat', 'profil_id'],
  ['album', 'opprettet_av'], ['album_bilde', 'lastet_opp_av'], ['album_bilde_reaksjon', 'profil_id'], ['album_bilde_chat', 'profil_id'],
  ['kaaring_vinnere', 'profil_id'], ['kaaring_vinnere', 'opprettet_av'],
  ['arrangoransvar', 'ansvarlig_id'], ['kart_markering', 'opprettet_av'], ['timeplan_post', 'opprettet_av'],
  ['bursdagsbilde', 'profil_id'], ['innspill_kobling', 'profil_id'],
  ['pass_tilgang_forespørsel', 'soker_id'], ['pass_tilgang_forespørsel', 'eier_id'],
  ['fond_bevegelse', 'profil_id'], ['fond_innskudd', 'profil_id'], ['fond_navn_alias', 'profil_id'],
]

describe('migrasjon 165: sammensatte fremmednøkler', () => {
  it('tabellene i testen har riktig størrelse (30 forelder-FK-er, 31 medlemskap-FK-er, 9 foreldre)', () => {
    expect(FORELDER_FK).toHaveLength(30)
    expect(MEDLEMSKAP_FK).toHaveLength(31)
    expect(FORELDRE_MED_KLUBB_NOEKKEL).toHaveLength(9)
    expect(new Set(FORELDER_FK.map(f => f[2]))).toEqual(new Set(FORELDRE_MED_KLUBB_NOEKKEL))
  })

  it('første setning er set local lock_timeout = 3s', () => {
    expect(setninger[0]).toBe("set local lock_timeout = '3s'")
  })

  it('forhåndssjekkene står før første alter table og dekker versjon, alle 30 par og alle 31 kolonner', () => {
    const forst = SQL.indexOf('alter table')
    const sjekk = SQL.slice(0, forst)
    expect(sjekk).toContain("current_setting('server_version_num')::int < 150000")
    for (const [barn, kol, forelder] of FORELDER_FK) {
      expect(sjekk, `${barn}.${kol}`).toContain(`from public.${barn} b join public.${forelder} p on p.id = b.${kol} where p.klubb_id <> b.klubb_id`)
      expect(sjekk, `${barn}.${kol} feilmelding`).toContain(`migrasjon 165 avbrutt: ${barn}.${kol} peker på ${forelder} i en annen klubb.`)
    }
    for (const [tabell, kol] of MEDLEMSKAP_FK) {
      expect(sjekk, `${tabell}.${kol}`).toContain(
        `from public.${tabell} b where b.${kol} is not null and not exists (select 1 from public.medlemskap m where m.klubb_id = b.klubb_id and m.profil_id = b.${kol})`,
      )
    }
  })

  it('de 9 foreldrene får unique (klubb_id, id), hver i sin setning', () => {
    for (const p of FORELDRE_MED_KLUBB_NOEKKEL) {
      expect(setninger, p).toContain(`alter table public.${p} add constraint ${p}_klubb_id_id_key unique (klubb_id, id)`)
    }
    expect(setninger.filter(s => s.includes('unique'))).toHaveLength(9)
    // (id, klubb_id) hadde blitt rødt i nøkkelvakten fra 1.4.
    expect(F).not.toMatch(/unique \(id, klubb_id\)/)
  })

  it('unique-nøklene står før alle FK-ene som refererer til dem', () => {
    const sisteUnik = Math.max(...FORELDRE_MED_KLUBB_NOEKKEL.map(p => setninger.indexOf(`alter table public.${p} add constraint ${p}_klubb_id_id_key unique (klubb_id, id)`)))
    const foersteFk = setninger.findIndex(s => s.includes('foreign key'))
    expect(sisteUnik).toBeLessThan(foersteFk)
  })

  it('30 forelder-FK-er: drop før add, samme navn, eksakt on delete, set null med kolonneliste', () => {
    for (const [barn, kol, forelder, slett, navn] of FORELDER_FK) {
      const drop = setninger.indexOf(`alter table public.${barn} drop constraint ${navn}`)
      const handling = slett === 'set null' ? `set null (${kol})` : slett
      const add = setninger.indexOf(
        `alter table public.${barn} add constraint ${navn} foreign key (klubb_id, ${kol}) references public.${forelder} (klubb_id, id) on update cascade on delete ${handling}`,
      )
      expect(drop, `drop ${navn}`).toBeGreaterThanOrEqual(0)
      expect(add, `add ${navn}`).toBeGreaterThan(drop)
    }
    // Ingen set null uten kolonneliste (ville nullet klubb_id, som er not null). Kun alter table-setningene: do-blokken nevner frasen i en feilmelding.
    const alter = setninger.filter(s => s.startsWith('alter table')).join(' ; ')
    expect(alter).not.toMatch(/on delete set null(?! \()/)
    expect(alter.match(/on delete set null \(/g)).toHaveLength(FORELDER_FK.filter(f => f[3] === 'set null').length)
    expect(FORELDER_FK.filter(f => f[3] === 'set null')).toHaveLength(10)
    expect(FORELDER_FK.filter(f => f[3] === 'restrict')).toHaveLength(1)
  })

  it('31 medlemskap-FK-er: on update cascade og ingen on delete-klausul (NO ACTION)', () => {
    for (const [tabell, kol] of MEDLEMSKAP_FK) {
      const navn = `${tabell}_${kol}_medlemskap_fkey`
      const full = `alter table public.${tabell} add constraint ${navn} foreign key (klubb_id, ${kol}) references public.medlemskap (klubb_id, profil_id) on update cascade`
      expect(setninger, navn).toContain(full)
    }
    const mot = setninger.filter(s => s.includes('references public.medlemskap'))
    expect(mot).toHaveLength(31)
    for (const s of mot) expect(s).not.toContain('on delete')
  })

  it('30 støtteindekser (kolonne, klubb_id) på barnesiden', () => {
    for (const [barn, kol] of FORELDER_FK) {
      expect(setninger, `${barn}.${kol}`).toContain(`create index ${barn}_${kol}_klubb_id_idx on public.${barn} (${kol}, klubb_id)`)
    }
    expect(setninger.filter(s => s.startsWith('create index'))).toHaveLength(30)
  })

  it('ingen not valid, grant, policy, trigger eller drop … cascade', () => {
    expect(SQL).not.toContain('not valid')
    expect(SQL).not.toMatch(/\bgrant\b/)
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toContain('create trigger')
    expect(SQL).not.toMatch(/drop [^;]*\bcascade\b/)
    expect(F).not.toMatch(/(drop|add) [^;]*if exists/)
  })

  it('ingen FK fra «bare personen»-kolonnene mot medlemskap', () => {
    for (const { kolonne } of PROFIL_FK_BARE_PERSON) {
      const [tabell, kol] = kolonne.split('.')
      expect(F, kolonne).not.toContain(`alter table public.${tabell} add constraint ${tabell}_${kol}_medlemskap_fkey`)
      expect(MEDLEMSKAP_FK.some(([t, k]) => t === tabell && k === kol), kolonne).toBe(false)
    }
    expect(PROFIL_FK_BARE_PERSON).toHaveLength(10)
  })

  it('unntakslista «bare personen» i pr-check.yml er lik PROFIL_FK_BARE_PERSON', () => {
    const yml = readFileSync(path.resolve(__dirname, '../.github/workflows/pr-check.yml'), 'utf-8').replace(/\r\n/g, '\n')
    const m = /bare_person constant text\[\] := array\[([^\]]+)\]/.exec(yml)
    expect(m, 'fant ikke bare_person-lista i pr-check.yml').not.toBeNull()
    const iYml = [...m![1].matchAll(/'([^']+)'/g)].map(x => x[1])
    expect(iYml).toEqual(PROFIL_FK_BARE_PERSON.map(u => u.kolonne))
  })
})

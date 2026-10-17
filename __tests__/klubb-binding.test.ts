// Klubb-bindingen for service-role-klienten (#871). Builderen inspiseres uten nettverk:
// supabase-js lager et PostgrestFilterBuilder med `url` og `body` før noe sendes, og vi
// awaiter aldri. Mot en falsk URL — testen kan ikke treffe en ekte database.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  bindTilKlubb,
  bindPlattform,
  GLOBALE_TABELLER,
  KAN_MANGLE_KLUBB,
  KlubbKonfliktFeil,
  KlubbManglerFeil,
} from '@/lib/supabase/klubb-binding'
import { KLUBB_ID_UNNTAK, tabellerFraTyper } from './helpers/klubb-tabeller'

const KLUBB_A = '00000000-0000-4000-a000-000000000001'
const KLUBB_B = '00000000-0000-4000-a000-000000000002'

function rå() {
  return createClient('http://localhost:54321', 'ikke-en-ekte-nokkel')
}
// Builderens interne felt er ikke i typene.
type Byggeklosse = { url: URL; body: unknown }
const som = (b: unknown) => b as Byggeklosse
const klubbFilter = (b: unknown) => som(b).url.searchParams.get('klubb_id')

describe('GLOBALE_TABELLER', () => {
  it('er identisk med KLUBB_ID_UNNTAK (tabellene uten klubb_id)', () => {
    expect([...GLOBALE_TABELLER].sort()).toEqual(KLUBB_ID_UNNTAK.map(u => u.tabell).sort())
  })

  it('er alle tabeller som finnes i de genererte typene', () => {
    const alle = new Set(tabellerFraTyper())
    for (const t of GLOBALE_TABELLER) expect(alle.has(t)).toBe(true)
  })

  it('KAN_MANGLE_KLUBB er en klubbeid tabell (feil_logg), ikke en global', () => {
    for (const t of KAN_MANGLE_KLUBB) {
      expect(GLOBALE_TABELLER.has(t)).toBe(false)
      expect(tabellerFraTyper()).toContain(t)
    }
  })
})

describe('bindTilKlubb – insert/upsert', () => {
  const admin = bindTilKlubb(rå(), KLUBB_A)

  it('eksponerer klubbId', () => {
    expect(admin.klubbId).toBe(KLUBB_A)
  })

  it('legger klubb_id på en insert med ett objekt', () => {
    const b = admin.from('klubb_chat').insert({ innhold: 'hei' })
    expect(som(b).body).toEqual({ innhold: 'hei', klubb_id: KLUBB_A })
  })

  it('legger klubb_id på hver rad i en array-insert', () => {
    const b = admin.from('poll_valg').insert([{ tekst: 'a' }, { tekst: 'b' }])
    expect(som(b).body).toEqual([
      { tekst: 'a', klubb_id: KLUBB_A },
      { tekst: 'b', klubb_id: KLUBB_A },
    ])
  })

  it('legger klubb_id på upsert', () => {
    const b = admin.from('varsel_innstillinger').upsert({ noekkel: 'x', aktiv: true })
    expect(som(b).body).toEqual({ noekkel: 'x', aktiv: true, klubb_id: KLUBB_A })
  })

  it('godtar en rad som alt har riktig klubb_id', () => {
    const b = admin.from('klubb_chat').insert({ innhold: 'hei', klubb_id: KLUBB_A })
    expect(som(b).body).toEqual({ innhold: 'hei', klubb_id: KLUBB_A })
  })

  it('kaster KlubbKonfliktFeil når raden har en annen klubb_id', () => {
    expect(() => admin.from('klubb_chat').insert({ innhold: 'hei', klubb_id: KLUBB_B })).toThrow(
      KlubbKonfliktFeil,
    )
  })

  it('kaster ved konflikt i EN rad i en array – ingen halv insert', () => {
    expect(() =>
      admin.from('poll_valg').insert([{ tekst: 'a' }, { tekst: 'b', klubb_id: KLUBB_B }]),
    ).toThrow(KlubbKonfliktFeil)
  })

  it('beholder kjeding videre (select/single) etter insert', () => {
    const b = admin.from('poll').insert({ spoersmaal: 'x' }).select('id')
    expect(som(b).body).toEqual({ spoersmaal: 'x', klubb_id: KLUBB_A })
    expect(som(b).url.searchParams.get('select')).toBe('id')
  })
})

describe('bindTilKlubb – select/update/delete', () => {
  const admin = bindTilKlubb(rå(), KLUBB_A)

  it('filtrerer select på klubb_id', () => {
    const b = admin.from('poll').select('id, spoersmaal').eq('id', 'p1')
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
    expect(som(b).url.searchParams.get('id')).toBe('eq.p1')
  })

  it('filtrerer select med head/count (telling)', () => {
    const b = admin.from('varsel_logg').select('id', { count: 'exact', head: true })
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
  })

  it('filtrerer update på klubb_id', () => {
    const b = admin.from('poll').update({ spoersmaal: 'y' }).eq('id', 'p1')
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
    expect(som(b).body).toEqual({ spoersmaal: 'y' }) // update-payloaden røres ikke
  })

  it('godtar update med samme klubb_id som bindingen', () => {
    const b = admin.from('poll').update({ spoersmaal: 'y', klubb_id: KLUBB_A }).eq('id', 'p1')
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
  })

  it('kaster KlubbKonfliktFeil når update forsøker å flytte rader til en annen klubb', () => {
    expect(() => admin.from('poll').update({ klubb_id: KLUBB_B })).toThrow(KlubbKonfliktFeil)
    expect(() => admin.from('poll').update({ klubb_id: null })).toThrow(KlubbKonfliktFeil)
  })

  it('filtrerer delete på klubb_id', () => {
    const b = admin.from('poll').delete({ count: 'exact' }).eq('id', 'p1')
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
  })
})

describe('bindTilKlubb – globale tabeller, rpc, auth, storage', () => {
  const admin = bindTilKlubb(rå(), KLUBB_A)

  it.each([...GLOBALE_TABELLER])('lar %s gå uendret gjennom', tabell => {
    const lesing = admin.from(tabell as 'profiles').select('id')
    expect(klubbFilter(lesing)).toBeNull()
  })

  it('legger ikke klubb_id på insert til en global tabell', () => {
    const b = admin.from('push_subscriptions').insert({
      profil_id: 'p1',
      endpoint: 'e',
      p256dh: 'k',
      auth: 'a',
    })
    expect(som(b).body).toEqual({ profil_id: 'p1', endpoint: 'e', p256dh: 'k', auth: 'a' })
  })

  it('rpc, auth og storage er tilgjengelige og uendret', () => {
    expect(typeof admin.rpc).toBe('function')
    expect(typeof admin.auth.admin.createUser).toBe('function')
    expect(typeof admin.storage.from).toBe('function')
  })
})

describe('bindTilKlubb – schema()', () => {
  const admin = bindTilKlubb(rå(), KLUBB_A)

  it("schema('public').from() filtrerer select på klubb_id", () => {
    const b = admin.schema('public').from('poll').select('id')
    expect(klubbFilter(b)).toBe(`eq.${KLUBB_A}`)
  })

  it("schema('public').from() legger klubb_id på insert og avviser fremmed klubb", () => {
    const b = admin.schema('public').from('klubb_chat').insert({ innhold: 'hei' })
    expect(som(b).body).toEqual({ innhold: 'hei', klubb_id: KLUBB_A })
    expect(() =>
      admin.schema('public').from('klubb_chat').insert({ innhold: 'hei', klubb_id: KLUBB_B }),
    ).toThrow(KlubbKonfliktFeil)
  })

  it("schema('public').from() filtrerer update/delete og avviser flytting", () => {
    expect(klubbFilter(admin.schema('public').from('poll').update({ spoersmaal: 'y' }))).toBe(
      `eq.${KLUBB_A}`,
    )
    expect(klubbFilter(admin.schema('public').from('poll').delete())).toBe(`eq.${KLUBB_A}`)
    expect(() => admin.schema('public').from('poll').update({ klubb_id: KLUBB_B })).toThrow(
      KlubbKonfliktFeil,
    )
  })

  it('avviser andre schemas fail-closed', () => {
    expect(() => admin.schema('auth')).toThrow(/kun schema «public»/)
  })
})

describe('bindPlattform – schema()', () => {
  const plattform = bindPlattform(rå())
  it("schema('public').from() krever klubb_id på insert", () => {
    expect(() => plattform.schema('public').from('klubb_chat').insert({ innhold: 'hei' })).toThrow(
      KlubbManglerFeil,
    )
  })
})

describe('bindTilKlubb – validering', () => {
  it('kaster på en ugyldig klubb-id', () => {
    expect(() => bindTilKlubb(rå(), 'ikke-en-uuid')).toThrow(/Ugyldig klubb-id/)
    expect(() => bindTilKlubb(rå(), '')).toThrow(/Ugyldig klubb-id/)
  })
})

describe('bindPlattform', () => {
  const plattform = bindPlattform(rå())

  it('leser på tvers: ingen klubb-filter på select', () => {
    expect(klubbFilter(plattform.from('feil_logg').select('id'))).toBeNull()
    expect(klubbFilter(plattform.from('poll').select('id'))).toBeNull()
  })

  it('kaster ved insert til klubbeid tabell uten klubb_id', () => {
    expect(() => plattform.from('klubb_chat').insert({ innhold: 'hei' })).toThrow(KlubbManglerFeil)
  })

  it('kaster ved array-insert når EN rad mangler klubb_id', () => {
    expect(() =>
      plattform.from('poll_valg').insert([{ tekst: 'a', klubb_id: KLUBB_A }, { tekst: 'b' }]),
    ).toThrow(KlubbManglerFeil)
  })

  it('kaster ved upsert uten klubb_id', () => {
    expect(() => plattform.from('varsel_innstillinger').upsert({ noekkel: 'x' })).toThrow(
      KlubbManglerFeil,
    )
  })

  it('godtar insert med eksplisitt klubb_id, uendret', () => {
    const b = plattform.from('klubb_chat').insert({ innhold: 'hei', klubb_id: KLUBB_B })
    expect(som(b).body).toEqual({ innhold: 'hei', klubb_id: KLUBB_B })
  })

  it('unntak: feil_logg kan settes inn uten klubb_id («uten klubb»)', () => {
    const b = plattform.from('feil_logg').insert({ event: 'x', nivaa: 'error' })
    expect(som(b).body).toEqual({ event: 'x', nivaa: 'error' })
  })

  it('globale tabeller trenger ikke klubb_id', () => {
    expect(() =>
      plattform
        .from('push_subscriptions')
        .insert({ profil_id: 'p1', endpoint: 'e', p256dh: 'k', auth: 'a' }),
    ).not.toThrow()
  })
})

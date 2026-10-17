// Klubb-binding for service-role-klienten (#871, multi-tenant 2.4).
//
// Service-role omgår RLS og har ikke noe innloggings-token, så `klubb_id`-defaulten
// (standard_klubb_id()) var eneste kilde til klubb for rader satt inn med den. Denne
// modulen gjør klubben eksplisitt: klienten bindes til én klubb ved opprettelse, og
// `from()` legger på klubben for oss. Ren modul uten `server-only` — gjenbrukes av
// e2e-hjelperen og testes direkte.
//
// Kast herfra er programmeringsfeil (bevisst fail-closed), ikke `{ error }`.
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tabeller uten klubb_id. MÅ være identisk med KLUBB_ID_UNNTAK i
 * __tests__/helpers/klubb-tabeller.ts (pinnet i __tests__/klubb-binding.test.ts):
 * en kopi her, fordi test-hjelperen ikke kan importeres fra produksjonskode.
 */
export const GLOBALE_TABELLER: ReadonlySet<string> = new Set([
  'klubb',
  'profiles',
  'push_subscriptions',
  'pass_info',
])

/**
 * Klubbeide tabeller der plattformklienten får utelate klubb_id på insert/upsert.
 * feil_logg: «uten klubb» er en gyldig tilstand (standardklubb nå, NULL i 2.4b).
 */
export const KAN_MANGLE_KLUBB: ReadonlySet<string> = new Set(['feil_logg'])

export class KlubbKonfliktFeil extends Error {
  constructor(tabell: string, forventet: string, faktisk: unknown) {
    super(
      `Rad til «${tabell}» har klubb_id ${String(faktisk)}, men klienten er bundet til ${forventet}`,
    )
    this.name = 'KlubbKonfliktFeil'
  }
}

export class KlubbManglerFeil extends Error {
  constructor(tabell: string) {
    super(`Plattformklienten krever eksplisitt klubb_id på rader til «${tabell}»`)
    this.name = 'KlubbManglerFeil'
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Rad = Record<string, unknown>
// Bevisst løst: Proxyen sitter over supabase-js sin generiske builder, som ikke lar seg type presist.
type Builder = any

function somRader(verdi: unknown): Rad[] {
  return (Array.isArray(verdi) ? verdi : [verdi]) as Rad[]
}

function medKlubb(verdi: unknown, tabell: string, klubbId: string): unknown {
  const sett = (rad: Rad): Rad => {
    if (rad.klubb_id !== undefined && rad.klubb_id !== klubbId) {
      throw new KlubbKonfliktFeil(tabell, klubbId, rad.klubb_id)
    }
    return { ...rad, klubb_id: klubbId }
  }
  return Array.isArray(verdi) ? verdi.map(r => sett(r as Rad)) : sett(verdi as Rad)
}

// update-payloaden får ikke flytte en rad til en annen klubb: WHERE-filteret avgrenser
// bare HVILKE rader som treffes, ikke hva klubb_id settes til. Ingen stille overskriving
// — en avvikende klubb_id er en programmeringsfeil, som på insert/upsert.
function sjekkUpdate(verdi: unknown, tabell: string, klubbId: string): void {
  const rad = verdi as Rad | null | undefined
  if (rad && rad.klubb_id !== undefined && rad.klubb_id !== klubbId) {
    throw new KlubbKonfliktFeil(tabell, klubbId, rad.klubb_id)
  }
}

function krevKlubb(verdi: unknown, tabell: string): void {
  if (KAN_MANGLE_KLUBB.has(tabell)) return
  for (const rad of somRader(verdi)) {
    if (rad?.klubb_id === undefined || rad.klubb_id === null) throw new KlubbManglerFeil(tabell)
  }
}

function bindTabell(builder: Builder, tabell: string, klubbId: string): Builder {
  return new Proxy(builder, {
    get(mål, prop) {
      const v = Reflect.get(mål, prop, mål)
      if (typeof v !== 'function') return v
      if (prop === 'insert' || prop === 'upsert') {
        return (verdi: unknown, ...rest: unknown[]) =>
          v.call(mål, medKlubb(verdi, tabell, klubbId), ...rest)
      }
      if (prop === 'update') {
        return (verdi: unknown, ...rest: unknown[]) => {
          sjekkUpdate(verdi, tabell, klubbId)
          return v.call(mål, verdi, ...rest).eq('klubb_id', klubbId)
        }
      }
      if (prop === 'select' || prop === 'delete') {
        // Filteret legges på filterbuilderen som metoden returnerer.
        return (...args: unknown[]) => v.call(mål, ...args).eq('klubb_id', klubbId)
      }
      return v.bind(mål)
    },
  })
}

function bindPlattformTabell(builder: Builder, tabell: string): Builder {
  return new Proxy(builder, {
    get(mål, prop) {
      const v = Reflect.get(mål, prop, mål)
      if (typeof v !== 'function') return v
      if (prop === 'insert' || prop === 'upsert') {
        return (verdi: unknown, ...rest: unknown[]) => {
          krevKlubb(verdi, tabell)
          return v.call(mål, verdi, ...rest)
        }
      }
      return v.bind(mål)
    },
  })
}

function proxyKlient<K extends SupabaseClient<any, any, any>>(
  klient: K,
  bindFra: (builder: Builder, tabell: string) => Builder,
  ekstra: Record<string, unknown> = {},
): K {
  return new Proxy(klient, {
    get(mål, prop) {
      if (prop in ekstra) return ekstra[prop as string]
      if (prop === 'from') {
        return (tabell: string) => {
          const b = mål.from(tabell)
          return GLOBALE_TABELLER.has(tabell) ? b : bindFra(b, tabell)
        }
      }
      // schema() gir en ny PostgREST-klient med egen from() — uten denne grenen
      // gikk `.schema('public').from(...)` rett forbi bindingen. Kun public er
      // klassifisert (GLOBALE_TABELLER gjelder public), så andre schemas avvises.
      if (prop === 'schema') {
        return (navn: string) => {
          if (navn !== 'public') {
            throw new Error(`Klubb-bundet klient støtter kun schema «public», ikke «${navn}»`)
          }
          const pg = mål.schema(navn)
          return new Proxy(pg, {
            get(pgMål, pgProp) {
              if (pgProp === 'from') {
                return (tabell: string) => {
                  const b = pgMål.from(tabell)
                  return GLOBALE_TABELLER.has(tabell) ? b : bindFra(b, tabell)
                }
              }
              if (pgProp === 'schema') {
                return () => {
                  throw new Error('schema() kan ikke kjedes på en klubb-bundet klient')
                }
              }
              const pv = Reflect.get(pgMål, pgProp, pgMål)
              return typeof pv === 'function' ? pv.bind(pgMål) : pv
            },
          })
        }
      }
      const v = Reflect.get(mål, prop, mål)
      return typeof v === 'function' ? v.bind(mål) : v
    },
  })
}

/** Binder klienten til én klubb: insert/upsert får klubb_id, select/update/delete filtreres på den. */
export function bindTilKlubb<K extends SupabaseClient<any, any, any>>(
  klient: K,
  klubbId: string,
): K & { readonly klubbId: string } {
  if (!UUID_RE.test(klubbId)) throw new Error(`Ugyldig klubb-id: ${klubbId}`)
  return proxyKlient(klient, (b, t) => bindTabell(b, t, klubbId), { klubbId }) as K & {
    readonly klubbId: string
  }
}

/** Plattformklient: leser på tvers, men insert/upsert må bære klubb_id (unntatt KAN_MANGLE_KLUBB). */
export function bindPlattform<K extends SupabaseClient<any, any, any>>(klient: K): K {
  return proxyKlient(klient, bindPlattformTabell)
}

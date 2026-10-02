import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { adminKlient } from './helpers/admin-klient'

/**
 * #626 (migrasjon 154): push-telemetri med klikk_id deduperes per
 * (event, klikk_id, forsok), ikke per (profil, event, minutt). Før 154 ga to
 * ulike push-klikk fra samme medlem innen samme minutt én rad, så regnskapet
 * push.klikk vs. navigert/landet manglet rader. Rader uten klikk_id skal
 * fortsatt minutt-dedupes (stormvernet).
 *
 * Indeksen lever i Postgres, så den kan kun pinnes mot en ekte database —
 * derfor e2e og ikke vitest. Specen skriver DIREKTE til feil_logg via
 * service_role i stedet for via /api/logg-feil: det er indeksene som pinnes,
 * ikke ruta, og ruta er rate-limitet — resten av suiten kan ha brukt opp
 * kvoten før denne testen kjører (429 i CI på PR #801).
 */
test.describe('feil_logg-dedup for push-telemetri (#626)', () => {
  test('per-klikk-indeksen og minutt-indeksen slår til på riktige rader', async () => {
    const admin = adminKlient('feil-logg-dedup')
    test.skip(!admin, 'E2E_SUPABASE_* mangler — se e2e/README.md')
    if (!admin) return

    const klikkA = `e2e-${randomUUID()}`
    const klikkB = `e2e-${randomUUID()}`
    const klikkC = `e2e-${randomUUID()}`
    // Unikt event-navn for kontrollen uten klikk_id, så andre specs ikke
    // kan bidra med rader i samme minutt.
    const kontrollEvent = `klient.test.e2e.dedup.${randomUUID().slice(0, 8)}`

    // Faste tidsstempler midt i et minutt, så testen aldri krysser et
    // minuttskifte av seg selv. `annetMinutt` ligger ett minutt senere.
    const minutt = new Date()
    minutt.setUTCSeconds(30, 0)
    const sammeMinutt = minutt.toISOString()
    const annetMinutt = new Date(minutt.getTime() + 60_000).toISOString()

    // Returnerer Postgres-feilkoden (null = raden ble skrevet).
    const sett = async (
      event: string,
      kontekst: Record<string, unknown>,
      opprettet = sammeMinutt,
    ): Promise<string | null> => {
      const { error } = await admin
        .from('feil_logg')
        .insert({ event, nivaa: 'warn', kontekst, opprettet, profil_id: null })
      return error ? (error.code ?? error.message) : null
    }

    try {
      // Ulike klikk, samme event, samme profil (null) og samme minutt: to rader.
      // Før 154 traff B minutt-indeksen.
      expect(await sett('push.klikk.navigert', { klikk_id: klikkA, forsok: 1 })).toBeNull()
      expect(await sett('push.klikk.navigert', { klikk_id: klikkB, forsok: 1 })).toBeNull()

      // Duplikat av A (samme event+klikk_id+forsok) — også i et annet minutt,
      // siden nøkkelen er klikket, ikke minuttet.
      expect(await sett('push.klikk.navigert', { klikk_id: klikkA, forsok: 1 })).toBe('23505')
      expect(await sett('push.klikk.navigert', { klikk_id: klikkA, forsok: 1 }, annetMinutt)).toBe('23505')

      // Nytt forsøk for samme klikk er en egen hendelse.
      expect(await sett('push.klikk.navigert', { klikk_id: klikkA, forsok: 2 })).toBeNull()

      // Samme klikk_id, annet event: egen rad (event er del av nøkkelen).
      expect(await sett('push.klikk.landet', { klikk_id: klikkA, forsok: 1 })).toBeNull()

      // Uten forsok (push.klikk): coalesce(forsok, '') gjør at duplikatet
      // likevel fanges — NULL er ellers distinkt i en unique-indeks.
      expect(await sett('push.klikk', { klikk_id: klikkC })).toBeNull()
      expect(await sett('push.klikk', { klikk_id: klikkC })).toBe('23505')

      // Uten klikk_id: minutt-dedupen gjelder som før.
      expect(await sett(kontrollEvent, {})).toBeNull()
      expect(await sett(kontrollEvent, {})).toBe('23505')
      expect(await sett(kontrollEvent, {}, annetMinutt)).toBeNull()

      // Kontrollest: radene som faktisk ligger der matcher utfallene over.
      const { data: klikkRader, error: klikkFeil } = await admin
        .from('feil_logg')
        .select('event, kontekst')
        .in('kontekst->>klikk_id', [klikkA, klikkB, klikkC])
      if (klikkFeil) throw new Error(`Kunne ikke lese feil_logg: ${klikkFeil.message}`)
      const navn: Record<string, string> = { [klikkA]: 'A', [klikkB]: 'B', [klikkC]: 'C' }
      const noekler = (klikkRader ?? [])
        .map(r => {
          const k = r.kontekst as { klikk_id: string; forsok?: number }
          return `${r.event}:${navn[k.klikk_id]}:${k.forsok ?? '-'}`
        })
        .sort()
      expect(noekler).toEqual([
        'push.klikk.landet:A:1',
        'push.klikk.navigert:A:1',
        'push.klikk.navigert:A:2',
        'push.klikk.navigert:B:1',
        'push.klikk:C:-',
      ])
    } finally {
      const { error: slettKlikk } = await admin
        .from('feil_logg')
        .delete()
        .in('kontekst->>klikk_id', [klikkA, klikkB, klikkC])
      if (slettKlikk) console.warn(`[feil-logg-dedup] opprydding feilet: ${slettKlikk.message}`)
      const { error: slettKontroll } = await admin.from('feil_logg').delete().eq('event', kontrollEvent)
      if (slettKontroll) console.warn(`[feil-logg-dedup] opprydding feilet: ${slettKontroll.message}`)
    }
  })
})

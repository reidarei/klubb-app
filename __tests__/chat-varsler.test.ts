/**
 * Tester for chat-varsling (#612): sendChatVarsler() i lib/varsler.ts
 * varsler nå ALLE aktive medlemmer minus avsender på enhver chat-melding,
 * med @-mention prioritert som en egen, separat sending foran broadcasten.
 *
 * varsler.test.ts er allerede 1200+ linjer — denne fila samler de nye
 * chat-spesifikke scenarioene i stedet for å vokse den ytterligere.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { lagChain } from './helpers/supabase-mock'

// Mock Supabase admin-klient — samme oppsett som varsler.test.ts. vi.hoisted
// fordi createServerClient/ensureInnlogget-mockene under refererer
// mockSupabase inne i en vi.mock-fabrikk, som hoises til toppen av filen
// (før vanlige const-deklarasjoner) — se actions-chat-reaksjoner.integration.test.ts.
const { mockFrom, mockSupabase } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockSupabase = { from: mockFrom }
  return { mockFrom, mockSupabase }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

// sendChatMelding (testet i egen describe lenger ned) går via createServerClient,
// ikke createAdminClient — samme mockSupabase, så begge klientene ser samme
// mockFrom-dispatch.
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'avsender1' },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockSendPush = vi.fn().mockResolvedValue(undefined)
const mockSendEpostBatch = vi.fn().mockResolvedValue(undefined)
const mockArrangementEpostHtml = vi.fn().mockReturnValue('<html>test</html>')

vi.mock('@/lib/push', () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}))

const mockLoggWarn = vi.fn()
const mockLoggFeil = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/logg', () => ({
  logg: {
    warn: (...args: unknown[]) => mockLoggWarn(...args),
    feil: (...args: unknown[]) => mockLoggFeil(...args),
  },
}))

vi.mock('@/lib/epost', () => ({
  sendEpost: vi.fn(),
  sendEpostBatch: (...args: unknown[]) => mockSendEpostBatch(...args),
  arrangementEpostHtml: (...args: unknown[]) => mockArrangementEpostHtml(...args),
}))

import { sendChatVarsler, sendVarsel, finnNevnte, type ChatVarselScope } from '@/lib/varsler'
import { sendChatMelding } from '@/lib/actions/chat'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Fixtures + oppsett-helpere ──────────────────────────────────────────────

const NILS = { id: 'avsender1', navn: 'Nils Nordmann', visningsnavn: 'Nils', epost: 'nils@test.no' }
const OLA = { id: 'user1', navn: 'Ola Nordmann', visningsnavn: 'Ola', epost: 'ola@test.no' }
const PER = { id: 'user2', navn: 'Per Hansen', visningsnavn: 'Per', epost: 'per@test.no' }
const ALLE_PROFILER = [NILS, OLA, PER]

// Egen profiles-chain (samme presedens som varsler.test.ts:695-715): profiles
// spørres to ganger per sendChatVarsler-kall — først av sendChatVarsler selv
// (alle aktive, for mention-matching OG broadcast-lista), så av sendVarsel
// med .in('id', mottakere) per sending. lagChain ignorerer .in-filteret, så
// vi trenger en egen chain som faktisk filtrerer for å kunne skille «Ola ble
// varslet» fra «alle ble varslet».
function profilChain() {
  let idFilter: string[] | null = null
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gt', 'gte', 'lt', 'is', 'not', 'limit', 'order', 'neq']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.in = vi.fn((_kol: string, verdier: string[]) => {
    idFilter = verdier
    return chain
  })
  const resultat = () => ({
    data: idFilter ? ALLE_PROFILER.filter(p => idFilter!.includes(p.id)) : ALLE_PROFILER,
    error: null,
  })
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resultat()).then(resolve)
  chain.maybeSingle = vi.fn(async () => ({ data: resultat().data[0] ?? null, error: null }))
  return chain
}

// varsel_innstillinger-chain som svarer per noekkel — nødvendig for å teste
// «avskrudd chat_klubb»/«avskrudd mention» uavhengig av hverandre. Default
// aktiv = true for alt som ikke er eksplisitt overstyrt.
function innstillingerChain(overrides: Record<string, boolean> = {}) {
  const chain: Record<string, unknown> = {}
  let noekkel = ''
  for (const m of ['select', 'limit', 'order']) chain[m] = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn((kol: string, verdi: string) => {
    if (kol === 'noekkel') noekkel = verdi
    return chain
  })
  chain.maybeSingle = vi.fn(async () => ({
    data: { aktiv: overrides[noekkel] ?? true, beskrivelse: null },
    error: null,
  }))
  return chain
}

function insertSpyOppsett() {
  const rader: Record<string, unknown>[] = []
  const insertSpy = vi.fn((rad: Record<string, unknown>) => {
    rader.push(rad)
    return {
      select: () => ({
        single: () => Promise.resolve({ data: { id: `rad-${rader.length}` }, error: null }),
      }),
    }
  })
  return { rader, insertSpy }
}

/**
 * Standard-oppsett: Ola og Per har push+epost aktiv, Nils er avsender.
 *
 * `epostDoegnCount` / `epostDoegnFeil` styrer svaret på e-post-budsjettvaktens
 * telling mot varsel_logg (#612-review). Utelates begge, resolver chainen som
 * før uten `count` — som blir 0 og dermed «godt under budsjett».
 */
function standardOppsett(
  opts: {
    innstillingerOverrides?: Record<string, boolean>
    epostDoegnCount?: number
    epostDoegnFeil?: boolean
  } = {},
) {
  const { rader, insertSpy } = insertSpyOppsett()
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'profiles') return profilChain()
    if (tabell === 'varsel_innstillinger') return innstillingerChain(opts.innstillingerOverrides ?? {})
    if (tabell === 'varsel_preferanser') {
      return lagChain([
        { profil_id: 'user1', push_aktiv: true, epost_aktiv: true },
        { profil_id: 'user2', push_aktiv: true, epost_aktiv: true },
      ])
    }
    if (tabell === 'push_subscriptions') {
      return lagChain([
        { profil_id: 'user1', endpoint: 'https://push.example.com/1', p256dh: 'k', auth: 'a' },
        { profil_id: 'user2', endpoint: 'https://push.example.com/2', p256dh: 'k', auth: 'a' },
      ])
    }
    if (tabell === 'varsel_logg') {
      const chain = lagChain([])
      chain.insert = insertSpy
      // Eneste awaitede (ikke-insert) varsel_logg-spørring i chat-flyten er
      // budsjettvaktens count — tillatDuplikat: true slår av dedup-select-ene.
      if (opts.epostDoegnCount !== undefined || opts.epostDoegnFeil) {
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({
            data: null,
            count: opts.epostDoegnCount ?? null,
            error: opts.epostDoegnFeil ? new Error('teller nede') : null,
          }).then(resolve)
      }
      return chain
    }
    // hentScopeInnhold sitt fail-åpne oppslag for arrangement/poll-tittel —
    // ikke kritisk for testene, men gir en realistisk tittel i stedet for
    // fallback-teksten (og unngår unødvendig logg.feil-støy i testoutput).
    if (tabell === 'arrangementer') return lagChain({ tittel: 'Vårfest' })
    if (tabell === 'poll') return lagChain({ spoersmaal: 'Hvem vinner kåringen?' })
    return lagChain([])
  })
  return { rader }
}

// ─── 1. Broadcast uten mention ───────────────────────────────────────────────

describe('sendChatVarsler – broadcast uten mention', () => {
  it('går til alle aktive minus avsender, med type chat_klubb', async () => {
    const { rader } = standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, 'Bare en vanlig melding, ingen mention her', 'avsender1', false)

    const perProfil = new Map(rader.map(r => [r.profil_id, r.type]))
    expect(perProfil.get('user1')).toBe('chat_klubb')
    expect(perProfil.get('user2')).toBe('chat_klubb')
    expect(perProfil.has('avsender1')).toBe(false)
  })
})

// ─── 2. @Ola gir Ola ÉN mention-rad, Per ÉN chat_klubb-rad ──────────────────

describe('sendChatVarsler – mention + broadcast er disjunkte', () => {
  it('@Ola gir Ola nøyaktig én rad (mention), Per nøyaktig én rad (chat_klubb)', async () => {
    const { rader } = standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, ser deg i kveld', 'avsender1', false)

    const olaRader = rader.filter(r => r.profil_id === 'user1')
    const perRader = rader.filter(r => r.profil_id === 'user2')
    expect(olaRader).toHaveLength(1)
    expect(olaRader[0].type).toBe('mention')
    expect(perRader).toHaveLength(1)
    expect(perRader[0].type).toBe('chat_klubb')
  })

  // ─── 3. @alle → kun mention, ingen broadcast-kall ─────────────────────────
  it('@alle gir kun mention-rader — broadcast-benet kalles ikke i det hele tatt', async () => {
    const { rader } = standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, '@alle — møtes kl 18', 'avsender1', false)

    expect(rader.every(r => r.type === 'mention')).toBe(true)
    expect(rader.map(r => r.profil_id).sort()).toEqual(['user1', 'user2'])
    // Ett sendVarsel-kall (mention) ⇒ én sendEpostBatch-kall. To ville betydd
    // at broadcast-benet feilaktig kjørte på en tom restliste.
    expect(mockSendEpostBatch).toHaveBeenCalledTimes(1)
  })
})

// ─── 4/5. VarselUtfall-kontrakten: kastepunkt/type_deaktivert legger de
//          nevnte tilbake i broadcast, aldri omvendt ──────────────────────

describe('sendChatVarsler – avskrudde brytere', () => {
  it('avskrudd chat_klubb: ingen broadcast, men mention går fortsatt', async () => {
    const { rader } = standardOppsett({ innstillingerOverrides: { chat_klubb: false } })

    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, husk møtet', 'avsender1', false)

    expect(rader.find(r => r.profil_id === 'user1')?.type).toBe('mention')
    // Per skulle fått chat_klubb, men bryteren er av — ingen rad for ham.
    expect(rader.some(r => r.profil_id === 'user2')).toBe(false)
  })

  it('avskrudd mention: Ola havner i broadcasten i stedet for å bli hoppet over', async () => {
    const { rader } = standardOppsett({ innstillingerOverrides: { mention: false } })

    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, husk møtet', 'avsender1', false)

    // type_deaktivert (ikke kastet) ⇒ ekskludert forblir tom ⇒ Ola er fortsatt
    // med i broadcast-lista. Pinner #504-kontrakten («returnerer = terminalt
    // avgjort») brukt til det den er til for: uten den ville en avskrudd
    // mention-bryter gjort Ola usynlig i BEGGE sendingene.
    expect(rader.find(r => r.profil_id === 'user1')?.type).toBe('chat_klubb')
    expect(rader.find(r => r.profil_id === 'user2')?.type).toBe('chat_klubb')
  })
})

// ─── 6. Kun bilde ────────────────────────────────────────────────────────────

describe('sendChatVarsler – ren bilde-melding', () => {
  it('«Nils la ut et bilde» — ikke tom melding, ikke privat-fallbacken', async () => {
    standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, null, 'avsender1', true)

    const push = JSON.stringify(mockSendPush.mock.calls)
    expect(push).toContain('Nils la ut et bilde')
    // Skal ALDRI se ut som en (tom) mention-tekst eller privat-meldingens
    // «Sendte deg et bilde» (skrevet for én-til-én, feil i en broadcast).
    expect(push).not.toContain('Nils: ')
    expect(push).not.toContain('Sendte deg et bilde')
  })
})

// ─── 7. Table-driven: riktig type per scope for alle fem ────────────────────

describe('sendChatVarsler – riktig broadcast-type per scope', () => {
  it.each([
    [{ type: 'klubb' } as ChatVarselScope, 'chat_klubb'],
    [{ type: 'arrangement', id: 'arr1' } as ChatVarselScope, 'chat_arrangement'],
    [{ type: 'poll', id: 'poll1' } as ChatVarselScope, 'chat_poll'],
    [{ type: 'melding', id: 'meld1' } as ChatVarselScope, 'chat_melding'],
    [{ type: 'albumbilde', bildeId: 'bilde1', albumId: 'album1' } as ChatVarselScope, 'chat_albumbilde'],
  ])('scope %o → type %s', async (scope, forventetType) => {
    const { rader } = standardOppsett()

    await sendChatVarsler(scope, 'En vanlig melding uten mention', 'avsender1', false)

    expect(rader).toHaveLength(2)
    expect(rader.every(r => r.type === forventetType)).toBe(true)
  })
})

// ─── 8. Privat forblir urørt ─────────────────────────────────────────────────

describe('sendChatMelding – privat-scope er urørt av #612', () => {
  it('varsler kun privat-melding — aldri en chat_*-type', async () => {
    const varselLoggRader: Record<string, unknown>[] = []

    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'samtale_chat') {
        const chain = lagChain([])
        chain.insert = vi.fn().mockReturnValue({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: 'melding1',
                  profil_id: 'avsender1',
                  innhold: 'Hei deg',
                  bilde_url: null,
                  video_url: null,
                  opprettet: '2026-01-01T00:00:00Z',
                },
                error: null,
              }),
          }),
        })
        return chain
      }
      if (tabell === 'samtale') return lagChain({ profil_a: 'avsender1', profil_b: 'user1' })
      if (tabell === 'varsel_innstillinger') return innstillingerChain()
      if (tabell === 'varsel_preferanser') {
        return lagChain([{ profil_id: 'user1', push_aktiv: true, epost_aktiv: true }])
      }
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') {
        const chain = lagChain([])
        chain.insert = vi.fn((rad: Record<string, unknown>) => {
          varselLoggRader.push(rad)
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'rad1' }, error: null }) }) }
        })
        return chain
      }
      // 'profiles' må håndtere BÅDE avsender-navn-oppslaget (.maybeSingle())
      // i sendPrivatMeldingVarsel OG mottaker-arrayet (plain await) i
      // sendVarsel — de to bruker samme tabell med ulik metode.
      if (tabell === 'profiles') {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'in', 'limit', 'order', 'neq', 'gt', 'gte', 'lt', 'is', 'not']) {
          chain[m] = vi.fn().mockReturnValue(chain)
        }
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: [{ id: 'user1', navn: 'Ola Nordmann', epost: 'ola@test.no' }], error: null }).then(
            resolve,
          )
        chain.maybeSingle = vi.fn(async () => ({
          data: { navn: 'Nils Nordmann', visningsnavn: 'Nils' },
          error: null,
        }))
        return chain
      }
      return lagChain([])
    })

    await sendChatMelding({ type: 'privat', samtaleId: 'samtale1' }, 'Hei deg')

    expect(varselLoggRader).toHaveLength(1)
    expect(varselLoggRader[0].type).toBe('privat-melding')
    expect(varselLoggRader.some(r => String(r.type).startsWith('chat_'))).toBe(false)
  })
})

// ─── 9. Fail-closed ──────────────────────────────────────────────────────────

describe('sendChatVarsler – fail closed', () => {
  it('kaster når profiles-oppslaget feiler — tolkes ALDRI som «ingen å varsle»', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'profiles') return lagChain([], new Error('DB nede'))
      return lagChain([])
    })

    await expect(
      sendChatVarsler({ type: 'klubb' }, 'Hei alle sammen', 'avsender1', false),
    ).rejects.toThrow(/chat-varsel/)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })
})

// ─── 10. finnNevnte (ren funksjon) ───────────────────────────────────────────

describe('finnNevnte', () => {
  const PROFILER = [
    { id: 'a1', navn: 'Nils Nordmann', visningsnavn: 'Nils' },
    { id: 'u1', navn: 'Ola Nordmann', visningsnavn: 'Ola' },
    { id: 'u2', navn: 'Per Hansen', visningsnavn: null },
    { id: 'u3', navn: 'Lars Erik Johansen', visningsnavn: null },
  ]

  it('@alle gir alle andre enn avsenderen', () => {
    const treff = finnNevnte('@alle møtes kl 18', PROFILER, 'a1')
    expect(treff.map(p => p.id).sort()).toEqual(['u1', 'u2', 'u3'])
  })

  it('ekskluderer alltid avsenderen, selv om han nevner seg selv', () => {
    const treff = finnNevnte('Dette er @Nils sitt bord', PROFILER, 'a1')
    expect(treff).toEqual([])
  })

  it('matcher flerords-navn', () => {
    const treff = finnNevnte('Hei @Lars, kommer du?', PROFILER, 'a1')
    expect(treff.map(p => p.id)).toEqual(['u3'])
  })

  it('ingen treff når teksten ikke har noen @', () => {
    expect(finnNevnte('Bare en vanlig setning', PROFILER, 'a1')).toEqual([])
  })

  it('ingen treff når @ ikke matcher noe navn', () => {
    expect(finnNevnte('@Ukjentnavn dukker aldri opp', PROFILER, 'a1')).toEqual([])
  })
})

// ─── 11. Seed-rad-vakt ───────────────────────────────────────────────────────

describe('CHAT_BROADCAST_TYPE – seed-rad-vakt', () => {
  // Samme presedens som __tests__/varsel-typer.test.ts sin noeklerFraMigrasjoner
  // — den vokter kun DB→kode (at hver DB-nøkkel har en norsk etikett). Denne
  // går andre veien: hver chat_*-type KODEN faktisk sender må ha en seed-rad
  // i en migrasjon, ellers går bryteren for full fart uten at admin kan skru
  // den av (erVarselAktiv() returnerer `?? true` når raden mangler — en typo
  // her er en STILLE feil).
  const MIGRASJONER = join(process.cwd(), 'supabase', 'migrations')

  function noeklerFraMigrasjoner(): Set<string> {
    const funnet = new Set<string>()
    for (const fil of readdirSync(MIGRASJONER).filter(f => f.endsWith('.sql'))) {
      const sql = readFileSync(join(MIGRASJONER, fil), 'utf8')
      if (!/insert\s+into\s+(public\.)?varsel_innstillinger/i.test(sql)) continue
      for (const m of sql.matchAll(/\(\s*'([^']+)'\s*,\s*(?:true|false)\b/gi)) {
        funnet.add(m[1])
      }
    }
    return funnet
  }

  // Duplisert med vilje (ikke eksportert fra lib/varsler.ts) — speiler
  // CHAT_BROADCAST_TYPE-nøklene der. Speiles også av test 7 over.
  const CHAT_TYPER = ['chat_klubb', 'chat_arrangement', 'chat_poll', 'chat_melding', 'chat_albumbilde']

  it('alle fem chat_*-typene har en seed-rad i en migrasjon', () => {
    const noekler = noeklerFraMigrasjoner()
    const mangler = CHAT_TYPER.filter(t => !noekler.has(t))
    expect(mangler).toEqual([])
  })
})

// ─── 12. teller_ulest per rad-type ───────────────────────────────────────────

describe('sendChatVarsler – teller_ulest', () => {
  it('false på broadcast-rader, true (default) på mention-rader', async () => {
    const { rader } = standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, husk møtet', 'avsender1', false)

    const olaRad = rader.find(r => r.profil_id === 'user1')
    const perRad = rader.find(r => r.profil_id === 'user2')
    expect(olaRad?.teller_ulest).toBe(true)
    expect(perRad?.teller_ulest).toBe(false)
  })
})

// ─── 13. push-tag (#612-review) ──────────────────────────────────────────────

describe('push-tag', () => {
  /** Alle tag-verdier fra denne sendingens sendPush-kall. */
  function tagger(): (string | undefined)[] {
    return mockSendPush.mock.calls.map(c => (c[1] as { tag?: string }).tag)
  }

  it('chat_klubb-broadcast får tag «chat:klubb»', async () => {
    standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, 'En vanlig melding', 'avsender1', false)

    expect(tagger()).toEqual(['chat:klubb', 'chat:klubb'])
  })

  it.each([
    [{ type: 'arrangement', id: 'arr1' } as ChatVarselScope, 'chat:arrangement:arr1'],
    [{ type: 'poll', id: 'poll1' } as ChatVarselScope, 'chat:poll:poll1'],
    // De to burst-flatene som IKKE har arrangementId/pollId å henge seg på —
    // de var utagget (undefined) fram til #612-review og kollapset derfor aldri.
    [{ type: 'melding', id: 'meld1' } as ChatVarselScope, 'chat:melding:meld1'],
    [{ type: 'albumbilde', bildeId: 'bilde1', albumId: 'album1' } as ChatVarselScope, 'chat:albumbilde:bilde1'],
  ])('scope %o gir tag %s', async (scope, forventetTag) => {
    standardOppsett()

    await sendChatVarsler(scope, 'En vanlig melding', 'avsender1', false)

    expect(new Set(tagger())).toEqual(new Set([forventetTag]))
  })

  it('mention-sendingen er utagget — en vanlig chat-melding skal ikke kunne erstatte «X nevnte deg»', async () => {
    standardOppsett()

    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, husk møtet', 'avsender1', false)

    const perProfil = new Map(
      mockSendPush.mock.calls.map(c => [
        (c[0] as { endpoint: string }).endpoint,
        (c[1] as { tag?: string }).tag,
      ]),
    )
    // endpoint /1 = Ola (mention), /2 = Per (broadcast)
    expect(perProfil.get('https://push.example.com/1')).toBeUndefined()
    expect(perProfil.get('https://push.example.com/2')).toBe('chat:klubb')
  })

  it('ikke-chat-varsel har ingen tag — en påminnelse skal aldri kollapses bort', async () => {
    standardOppsett()

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Arrangement oppdatert',
      melding: 'Vårfest er flyttet',
      type: 'oppdatert',
      tillatDuplikat: true,
    })

    expect(tagger()).toEqual([undefined])
  })
})

// ─── 14. Mention-benet KASTER (invarianten fra VarselUtfall-kommentaren) ─────

describe('sendChatVarsler – mention-benet kaster', () => {
  it('kast fra sendVarsel legger de nevnte tilbake i broadcasten', async () => {
    // erVarselAktiv() feiler LUKKET (kaster) når varsel_innstillinger-oppslaget
    // ryker. Vi lar KUN 'mention'-nøkkelen feile, så broadcast-benet er upåvirket
    // — da tester vi throw-stien, ikke type_deaktivert-stien (som § 4 dekker).
    const { rader, insertSpy } = insertSpyOppsett()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'profiles') return profilChain()
      if (tabell === 'varsel_innstillinger') {
        const chain: Record<string, unknown> = {}
        let noekkel = ''
        for (const m of ['select', 'limit', 'order']) chain[m] = vi.fn().mockReturnValue(chain)
        chain.eq = vi.fn((kol: string, verdi: string) => {
          if (kol === 'noekkel') noekkel = verdi
          return chain
        })
        chain.maybeSingle = vi.fn(async () =>
          noekkel === 'mention'
            ? { data: null, error: new Error('innstillinger nede') }
            : { data: { aktiv: true, beskrivelse: null }, error: null },
        )
        return chain
      }
      if (tabell === 'varsel_preferanser') {
        return lagChain([
          { profil_id: 'user1', push_aktiv: true, epost_aktiv: true },
          { profil_id: 'user2', push_aktiv: true, epost_aktiv: true },
        ])
      }
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') {
        const chain = lagChain([])
        chain.insert = insertSpy
        return chain
      }
      return lagChain([])
    })

    // Kaster ikke ut av sendChatVarsler — meldingen er alt lagret, og et tapt
    // varsel skal ikke se ut som en feilet «Send».
    await sendChatVarsler({ type: 'klubb' }, 'Hei @Ola, husk møtet', 'avsender1', false)

    // Kjernen i invarianten «sendVarsel kaster kun FØR utsendingsløkka»:
    // kastet betyr at Ola GARANTERT ikke fikk mention-varselet, og han kan
    // derfor trygt legges tilbake i broadcasten. Hadde sendVarsel kunnet kaste
    // midt i løkka, ville han her fått to varsler om samme melding.
    const olaRader = rader.filter(r => r.profil_id === 'user1')
    expect(olaRader).toHaveLength(1)
    expect(olaRader[0].type).toBe('chat_klubb')
    expect(rader.find(r => r.profil_id === 'user2')?.type).toBe('chat_klubb')
    // Eget event så vi ser HVILKET ben som ryker.
    expect(mockLoggFeil).toHaveBeenCalledWith('chat.varsler.mention.feilet', expect.anything())
  })
})

// ─── 15. E-post-døgnbudsjett (#612-review) ───────────────────────────────────

describe('e-post-døgnbudsjett for chat', () => {
  /** Alle e-poster som faktisk ble lagt i Resend-batchen for denne sendingen. */
  function epostAntall(): number {
    const siste = mockSendEpostBatch.mock.calls.at(-1)?.[0] as unknown[] | undefined
    return siste?.length ?? 0
  }

  it('over terskel: chat-varselet får push og in-app, men ingen e-post', async () => {
    const { rader } = standardOppsett({ epostDoegnCount: 95 })

    await sendChatVarsler({ type: 'klubb' }, 'En vanlig melding', 'avsender1', false)

    expect(mockSendPush).toHaveBeenCalledTimes(2)
    expect(epostAntall()).toBe(0)
    // Kanalen i innboks-raden skal si sannheten om hva som faktisk gikk ut.
    expect(rader.every(r => r.kanal === 'push')).toBe(true)
    expect(mockLoggWarn).toHaveBeenCalledWith(
      'varsel.epost.budsjett.chat_hoppet',
      expect.objectContaining({ sample: 'chat_klubb' }),
    )
  })

  it('under terskel: e-post går som normalt', async () => {
    standardOppsett({ epostDoegnCount: 10 })

    await sendChatVarsler({ type: 'klubb' }, 'En vanlig melding', 'avsender1', false)

    expect(epostAntall()).toBe(2)
  })

  it('ikke-chat-varsel går uansett — påminnelsene har forrang', async () => {
    standardOppsett({ epostDoegnCount: 95 })

    await sendVarsel({
      mottakere: ['user1', 'user2'],
      tittel: 'Påminnelse',
      melding: 'Vårfest om 7 dager',
      type: 'oppdatert',
      tillatDuplikat: true,
    })

    expect(epostAntall()).toBe(2)
    expect(mockLoggWarn).not.toHaveBeenCalledWith(
      'varsel.epost.budsjett.chat_hoppet',
      expect.anything(),
    )
  })

  it('feilet telling feiler ÅPENT: e-post sendes som normalt, men feilen logges', async () => {
    standardOppsett({ epostDoegnFeil: true })

    await sendChatVarsler({ type: 'klubb' }, 'En vanlig melding', 'avsender1', false)

    expect(epostAntall()).toBe(2)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'varsel.epost.budsjett.feilet',
      expect.anything(),
      expect.objectContaining({ ctx: expect.objectContaining({ sample: 'chat_klubb' }) }),
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'
import { revalideringsPaths, type ChatScope } from '@/lib/chat-konfig'

// Mock Supabase admin-klient + push/epost — samme oppsett som varsler.test.ts.
// vi.mock hoises til toppen av filen; variabler prefikset med "mock" kan
// refereres i factory-funksjonene selv om de er deklarert under her.
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

const mockSendPush = vi.fn().mockResolvedValue(undefined)
const mockSendEpostBatch = vi.fn().mockResolvedValue(undefined)
const mockArrangementEpostHtml = vi.fn().mockReturnValue('<html>test</html>')

vi.mock('@/lib/push', () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}))

vi.mock('@/lib/epost', () => ({
  sendEpost: vi.fn(),
  sendEpostBatch: (...args: unknown[]) => mockSendEpostBatch(...args),
  arrangementEpostHtml: (...args: unknown[]) => mockArrangementEpostHtml(...args),
}))

import { sendChatMentionVarsler } from '@/lib/varsler'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revalideringsPaths', () => {
  it('returnerer tom liste for albumbilde-scope', () => {
    const scope: ChatScope = { type: 'albumbilde', bildeId: 'bilde1', albumId: 'album1' }
    expect(revalideringsPaths(scope)).toEqual([])
  })
})

// hentScopeInnhold er ikke eksportert fra lib/varsler.ts — testes indirekte
// via sendChatMentionVarsler, som er eneste kalleren av den.
describe('mention-varsel for albumbilde-scope', () => {
  it('bygger URL på formen /album/{albumId}?bilde={bildeId}', async () => {
    mockFrom.mockImplementation(
      lagFromMock({
        profiles: [
          { id: 'avsender1', navn: 'Kari', visningsnavn: null, epost: 'kari@test.no' },
          { id: 'mottaker1', navn: 'Ola', visningsnavn: null, epost: 'ola@test.no' },
        ],
        varsel_innstillinger: { aktiv: true, beskrivelse: null },
        varsel_preferanser: [],
        push_subscriptions: [],
      }),
    )

    await sendChatMentionVarsler(
      { type: 'albumbilde', bildeId: 'bilde1', albumId: 'album1' },
      '@Ola kikk på dette bildet',
      'avsender1',
    )

    expect(mockArrangementEpostHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/album/album1?bilde=bilde1'),
        knappTekst: 'Åpne bildet',
      }),
    )
  })
})

// @vitest-environment node
// #760: bump og auto-omslag etter vellykket album-opplasting logges ved feil, men velter ikke opplastingen.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn<(tabell: string) => unknown>() }))

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: { from: mockFrom }, user: { id: 'bruker-1' } }),
}))
vi.mock('@/lib/r2', () => ({
  lastOppR2: vi.fn().mockResolvedValue('https://r2.example/album/bilde.jpg'),
  slettR2: vi.fn(),
  r2StiFraUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logg', () => ({ logg: { warn: vi.fn(), feil: vi.fn() } }))

import { lastOppAlbumBilde } from '@/lib/actions/album'
import { logg } from '@/lib/logg'

const ALBUM_ID = '11111111-1111-4111-8111-111111111111'

function lagFormData() {
  const fd = new FormData()
  fd.set('albumId', ALBUM_ID)
  fd.set('fil', new File([new Uint8Array([1, 2, 3])], 'bilde.jpg', { type: 'image/jpeg' }))
  return fd
}

// album-tabellen treffes to ganger etter inserten: 1 = oppdatert-bump, 2 = auto-omslag.
function mockAlbumKall(feilPaaKall: 1 | 2) {
  let albumKall = 0
  mockFrom.mockImplementation((tabell: string) => {
    if (tabell === 'album_bilde') return lagChain({ id: 'bilde-1' })
    if (tabell === 'album') {
      albumKall++
      return albumKall === feilPaaKall ? lagChain(null, { message: 'album feilet', code: 'DB9' }) : lagChain(null)
    }
    return lagChain(null)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('lastOppAlbumBilde — feil etter vellykket insert', () => {
  it('logger album.bump.feilet og returnerer fortsatt den opprettede raden', async () => {
    mockAlbumKall(1)

    await expect(lastOppAlbumBilde(lagFormData())).resolves.toEqual({
      id: 'bilde-1',
      url: 'https://r2.example/album/bilde.jpg',
    })
    expect(logg.warn).toHaveBeenCalledTimes(1)
    expect(logg.warn).toHaveBeenCalledWith('album.bump.feilet', { code: 'DB9', album_id: ALBUM_ID })
  })

  it('logger album.auto_omslag.feilet og returnerer fortsatt den opprettede raden', async () => {
    mockAlbumKall(2)

    await expect(lastOppAlbumBilde(lagFormData())).resolves.toEqual({
      id: 'bilde-1',
      url: 'https://r2.example/album/bilde.jpg',
    })
    expect(logg.warn).toHaveBeenCalledTimes(1)
    expect(logg.warn).toHaveBeenCalledWith('album.auto_omslag.feilet', { code: 'DB9', album_id: ALBUM_ID })
  })
})

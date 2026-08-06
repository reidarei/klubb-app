import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import Link from 'next/link'
import ChatBildeGalleri, { type ChatBilde } from '@/components/album/ChatBildeGalleri'
import { CHAT_STICKER_MONSTER } from '@/lib/konstanter'

// Bildene fra klubbchatten, samlet som et album (#569).
//
// Dette er en LEVENDE visning, ikke kopierte album_bilde-rader. Chat-meldinger
// kan slettes, og kopier ville da blitt spøkelser: bilder som fortsatt står i
// arkivet men ikke lenger finnes i kilden. Én sannhet er verdt den lille
// ekstrajobben med en egen visning.
//
// Ruta ligger på /album/chatten. Statiske segmenter vinner over [id] i Next,
// og album-id-er er uuid-er, så en kollisjon er umulig.

export default async function ChatBilderSide() {
  const [supabase] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const { data: rader, error } = await supabase
    .from('klubb_chat')
    .select('id, bilde_url, opprettet, profiles (navn, bilde_url, rolle)')
    .not('bilde_url', 'is', null)
    // Messenger-stickers er reaksjoner, ikke bilder — se konstanten.
    .not('bilde_url', 'like', CHAT_STICKER_MONSTER)
    .order('opprettet', { ascending: false })

  // Aggregat-side: en feilet spørring skal ikke vise et falskt tomt album.
  if (error) throw new Error(`Kunne ikke hente chat-bilder: ${error.message}`)

  type Rad = {
    id: string
    bilde_url: string
    opprettet: string
    profiles: { navn: string; bilde_url: string | null; rolle: string | null } | null
  }

  const bilder: ChatBilde[] = ((rader ?? []) as Rad[]).map(r => ({
    id: r.id,
    bilde_url: r.bilde_url,
    opprettet: r.opprettet,
    navn: r.profiles?.navn ?? 'Ukjent',
    bildeUrl: r.profiles?.bilde_url ?? null,
    rolle: r.profiles?.rolle ?? null,
  }))

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ padding: '12px 4px 6px' }}>
        <Link
          href="/album"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Album
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 400,
            letterSpacing: '-0.5px',
            margin: '8px 0 0',
            color: 'var(--text-primary)',
          }}
        >
          Fra chatten
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          {bilder.length} {bilder.length === 1 ? 'bilde' : 'bilder'}
        </div>
      </div>

      <ChatBildeGalleri bilder={bilder} />
    </div>
  )
}

import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import Link from 'next/link'
import OpprettAlbumKnapp from '@/components/album/OpprettAlbumKnapp'
import BildeBunke from '@/components/album/BildeBunke'

// Album-oversikt — alle album i klubben. Standalone-album og arrangement-
// koblede vises samme sted, sortert nyeste først. Kortet vises som en bunke
// fremkalte bilder (BildeBunke) med tittel, evt. arrangement-navn og antall
// under.
export default async function AlbumOversikt() {
  const [supabase] = await Promise.all([createServerClient(), getInnloggetBruker()])

  // Henter cover-bildet via FK-join (album_cover_fk) og antall via aggregat
  // — ikke hele bildelista. Album uten cover viser placeholder-ikonet
  // (eksplisitt > implisitt).
  const [{ data: albumer, error: albumerFeil }, { data: chatBilder, error: chatFeil }] =
    await Promise.all([
      supabase
        .from('album')
        .select(
          `id, tittel, arrangement_id, opprettet,
           arrangement:arrangementer (id, tittel),
           cover:album_bilde!album_cover_fk (bilde_url, thumb_url),
           antall:album_bilde!album_bilde_album_id_fkey (count)`,
        )
        .order('opprettet', { ascending: false }),
      // Chat-bildene vises som et eget album, men er en LEVENDE visning — ikke
      // kopierte album_bilde-rader. Se app/(app)/album/chatten/page.tsx.
      // Nyeste først, så [0] blir coveret.
      supabase
        .from('klubb_chat')
        .select('bilde_url', { count: 'exact' })
        .not('bilde_url', 'is', null)
        .order('opprettet', { ascending: false }),
    ])

  if (albumerFeil) throw new Error(`Kunne ikke hente album: ${albumerFeil.message}`)
  if (chatFeil) throw new Error(`Kunne ikke hente chat-bilder: ${chatFeil.message}`)

  type AlbumRad = {
    id: string
    tittel: string
    arrangement_id: string | null
    opprettet: string
    arrangement: { id: string; tittel: string } | { id: string; tittel: string }[] | null
    cover: { bilde_url: string; thumb_url: string | null } | { bilde_url: string; thumb_url: string | null }[] | null
    antall: { count: number }[] | null
  }

  const rader = ((albumer ?? []) as AlbumRad[]).map(a => {
    const arr = Array.isArray(a.arrangement) ? a.arrangement[0] : a.arrangement
    const cover = Array.isArray(a.cover) ? a.cover[0] : a.cover
    const thumb = cover?.thumb_url ?? cover?.bilde_url ?? null
    return {
      id: a.id,
      tittel: a.tittel,
      arrangement: arr,
      antall: a.antall?.[0]?.count ?? 0,
      thumb,
    }
  })

  // Chat-albumet står først: det er den eneste samlingen som vokser
  // fortløpende, så «nyeste først»-sorteringen gjør den permanent øverst
  // uansett. Da er det ærligere å plassere den eksplisitt enn å late som den
  // sorteres inn.
  const chatAntall = chatBilder?.length ?? 0
  const chatThumb = chatBilder?.[0]?.bilde_url ?? null

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ padding: '12px 4px 22px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          Album
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Bilder
        </h1>
      </div>

      <OpprettAlbumKnapp />

      {rader.length === 0 && chatAntall === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 'var(--radius-card)',
            border: '0.5px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
            marginTop: 16,
          }}
        >
          Ingen album opprettet ennå.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            // minmax(0, 1fr), ikke 1fr: `1fr` er `minmax(auto, 1fr)`, og
            // auto-minimum er innholdets min-content — her meta-linja
            // («22 BILDER · UTLANDSTUR 2025») som har white-space: nowrap.
            // Kolonnene vokste da forbi viewporten og høyre kort ble klippet
            // av `overflow-x: clip` på body. Kortet hadde tidligere
            // `overflow: hidden` som skjulte problemet; bunken har ikke det.
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            // Rausere gap enn de gamle 10 px: kortene er skjeve nå, og
            // hjørnene til to nabo-bunker ville ellers kommet i berøring.
            // 20 px horisontalt gir ~4 px klaring ved maks utslag.
            gap: '26px 20px',
            marginTop: 18,
            padding: '0 4px',
          }}
        >
          {chatAntall > 0 && (
            <Link
              href="/album/chatten"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <BildeBunke
                id="chatten"
                src={chatThumb}
                antall={chatAntall}
                sizes="(max-width: 480px) 50vw, 240px"
              />
              <div style={{ padding: '12px 2px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    letterSpacing: '-0.2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Fra chatten
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginTop: 3,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{chatAntall} bilder</span>
                </div>
              </div>
            </Link>
          )}

          {rader.map(r => (
            <Link
              key={r.id}
              href={`/album/${r.id}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <BildeBunke
                id={r.id}
                src={r.thumb}
                antall={r.antall}
                sizes="(max-width: 480px) 50vw, 240px"
              />
              <div style={{ padding: '12px 2px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    letterSpacing: '-0.2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.tittel}
                </div>
                {/* Arrangement først, antall sist. Flex (ikke én tekstlinje)
                    fordi rekkefølgen ellers ville ofret feil del: med begge i
                    samme nowrap-linje spiser ellipsen slutten, og et langt
                    arrangementsnavn ville kuttet vekk selve antallet.
                    Navnet krymper, antallet står. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.2px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginTop: 4,
                  }}
                >
                  {r.arrangement && (
                    <>
                      <span
                        style={{
                          // minWidth: 0 er det som lar flex-barnet krympe under
                          // sin min-content-bredde — uten den virker ikke ellipsen.
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.arrangement.tittel}
                      </span>
                      <span aria-hidden="true" style={{ flexShrink: 0 }}>
                        ·
                      </span>
                    </>
                  )}
                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {r.antall} {r.antall === 1 ? 'bilde' : 'bilder'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

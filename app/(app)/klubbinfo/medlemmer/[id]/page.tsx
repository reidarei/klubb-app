import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import { PanelGruppe } from '@/components/innstillinger/PanelRad'
import ListeBoks, { type ListeRad } from './ListeBoks'
import SendMeldingKnapp from './SendMeldingKnapp'
import { formaterDato } from '@/lib/dato'
import { kanAdministrere, tittelFor } from '@/lib/roller'
import { PilleLenke } from '@/components/ui/TreffPille'

export default async function MedlemProfil({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supabase, meg, megUser] = await Promise.all([
    createServerClient(),
    getProfil(),
    getInnloggetBruker(),
  ])
  const erAdmin = kanAdministrere(meg?.rolle)
  const erMegSelv = megUser?.id === id

  const [
    { data: medlem, error: medlemFeil },
    { data: egneKaaringer, error: egneKaaringerFeil },
    { data: arrKaaringer, error: arrKaaringerFeil },
    { data: arrangementer, error: arrangementerFeil },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, navn, visningsnavn, epost, telefon, rolle, fodselsdato, aktiv, bilde_url, stikkord, matallergier')
      .eq('id', id)
      .maybeSingle(),

    // Kåringer medlemmet selv har vunnet (f.eks. «Årets herre»)
    supabase
      .from('kaaring_vinnere')
      .select('id, aar, begrunnelse, kaaringmaler(navn)')
      .eq('profil_id', id)
      .order('aar', { ascending: false }),

    // Kåringer der et arrangement medlemmet arrangerte vant (f.eks.
    // «Årets arrangement»). Inner join på arrangementer filtrerer til bare
    // de der `opprettet_av = id`.
    supabase
      .from('kaaring_vinnere')
      .select('id, aar, begrunnelse, kaaringmaler(navn), arrangementer!inner(id, tittel, opprettet_av)')
      .eq('arrangementer.opprettet_av', id)
      .order('aar', { ascending: false }),

    supabase
      .from('arrangementer')
      .select('id, tittel, type, start_tidspunkt')
      .eq('opprettet_av', id)
      .order('start_tidspunkt', { ascending: false }),
  ])

  // Detaljside for et medlem — en feilet spørring skal ikke se ut som «ingen
  // kåringer»/«ingen arrangementer», det er en løgn om historikken hans.
  // .maybeSingle() over gir data=null/error=null på 0 rader; notFound() under
  // eier det tilfellet alene.
  if (medlemFeil) throw new Error(`Kunne ikke hente medlem: ${medlemFeil.message}`)
  if (egneKaaringerFeil) throw new Error(`Kunne ikke hente kåringer: ${egneKaaringerFeil.message}`)
  if (arrKaaringerFeil) throw new Error(`Kunne ikke hente arrangement-kåringer: ${arrKaaringerFeil.message}`)
  if (arrangementerFeil) throw new Error(`Kunne ikke hente arrangementer: ${arrangementerFeil.message}`)

  // Slå sammen de to kåringslistene, sortert synkende på år. Hver oppføring
  // er tagget med `kilde` slik at UI kan vise arrangement-tittelen når den
  // finnes.
  type KaaringVisning = {
    id: string
    aar: number
    navn: string
    begrunnelse: string | null
    arrangementTittel: string | null
    arrangementId: string | null
  }

  const egneListe: KaaringVisning[] = (egneKaaringer ?? []).map(k => {
    const mal = Array.isArray(k.kaaringmaler) ? k.kaaringmaler[0] : k.kaaringmaler
    return {
      id: k.id,
      aar: k.aar,
      navn: mal?.navn ?? 'Ukjent kåring',
      begrunnelse: k.begrunnelse,
      arrangementTittel: null,
      arrangementId: null,
    }
  })

  const arrListe: KaaringVisning[] = (arrKaaringer ?? []).map(k => {
    const mal = Array.isArray(k.kaaringmaler) ? k.kaaringmaler[0] : k.kaaringmaler
    const arr = Array.isArray(k.arrangementer) ? k.arrangementer[0] : k.arrangementer
    return {
      id: k.id,
      aar: k.aar,
      navn: mal?.navn ?? 'Ukjent kåring',
      begrunnelse: k.begrunnelse,
      arrangementTittel: arr?.tittel ?? null,
      arrangementId: arr?.id ?? null,
    }
  })

  const kaaringer: KaaringVisning[] = [...egneListe, ...arrListe].sort((a, b) => b.aar - a.aar)

  if (!medlem || (!medlem.aktiv && !erAdmin)) notFound()

  const rolleLabel = tittelFor(medlem.rolle)
  const navn = medlem.navn ?? 'Ukjent'

  const harVisningsnavn = medlem.visningsnavn && medlem.visningsnavn !== medlem.navn

  const kaaringRader: ListeRad[] = kaaringer.map(k => ({
    id: k.id,
    tittel: k.navn,
    undertekst: k.arrangementTittel,
    begrunnelse: k.begrunnelse,
    hoyre: String(k.aar),
    href: k.arrangementId ? `/arrangementer/${k.arrangementId}` : undefined,
  }))
  const arrangementRader: ListeRad[] = (arrangementer ?? []).map(a => ({
    id: a.id,
    tittel: a.tittel,
    hoyre: formaterDato(a.start_tidspunkt, 'MMM yyyy'),
    href: `/arrangementer/${a.id}`,
  }))

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <TilbakeKnapp href="/klubbinfo/medlemmer" til="Medlemmer" />
        {erAdmin && (
          <PilleLenke
            href={`/klubbinfo/medlemmer/${id}/rediger`}
            pilleStil={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 999,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
            }}
            synligHoyde={34}
          >
            Rediger
          </PilleLenke>
        )}
      </div>

      {/* Toppkort — samme stil som profil-hero på /profil */}
      <div
        style={{
          padding: 24,
          marginBottom: 14,
          textAlign: 'center',
          background: 'radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          backdropFilter: 'var(--blur-card)',
          WebkitBackdropFilter: 'var(--blur-card)',
        }}
      >
        <div style={{ display: 'inline-block' }}>
          <Avatar name={navn} size={78} src={medlem.bilde_url} rolle={medlem.rolle} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            lineHeight: 1.1,
            margin: '14px 0 0',
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {navn}
        </h1>
        {harVisningsnavn && (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: 4 }}>
            «{medlem.visningsnavn}»
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginTop: 8,
            fontWeight: 600,
          }}
        >
          {rolleLabel}
          {!medlem.aktiv && ' · Deaktivert'}
        </div>
      </div>

      {!erMegSelv && medlem.aktiv && (
        <div style={{ marginBottom: 22 }}>
          <SendMeldingKnapp motpartId={id} />
        </div>
      )}

      {/* Stikkord — skjules helt når tomt (#639). Fritekst siden #685, vist som brikke. */}
      {medlem.stikkord && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
          <span
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
            }}
          >
            {medlem.stikkord}
          </span>
        </div>
      )}

      {/* Matallergier står her: den som bestiller mat leter der telefonnummeret er.
          Vises alltid, også tom — «—» er informasjon når du planlegger en middag. */}
      <PanelGruppe tittel="Kontakt">
        <FaktaRad label="Telefon" value={medlem.telefon ?? '—'} href={medlem.telefon ? `tel:${medlem.telefon}` : undefined} />
        <FaktaRad label="E-post" value={medlem.epost ?? '—'} href={medlem.epost ? `mailto:${medlem.epost}` : undefined} />
        <FaktaRad
          label="Bursdag"
          value={medlem.fodselsdato ? formaterDato(`${medlem.fodselsdato}T12:00:00Z`, 'd. MMMM') : '—'}
        />
        <FaktaRad label="Matallergier" value={medlem.matallergier ?? '—'} />
      </PanelGruppe>

      {kaaringRader.length > 0 && <ListeBoks tittel="Kåringer" rader={kaaringRader} />}
      {arrangementRader.length > 0 && <ListeBoks tittel="Har laget" rader={arrangementRader} />}
    </div>
  )
}

// Rad med etikett til venstre og verdi til høyre; lenke (aksentfarge) når href er satt.
function FaktaRad({ label, value, href }: { label: string; value: string; href?: string }) {
  const stil: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: '11px 14px',
    minHeight: 48,
    textDecoration: 'none',
    color: 'inherit',
  }
  const innhold = (
    <>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-primary)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: href ? 'var(--accent)' : 'var(--text-tertiary)',
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
    </>
  )
  return href ? <a href={href} style={stil}>{innhold}</a> : <div style={stil}>{innhold}</div>
}

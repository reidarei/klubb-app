import { MapPinIcon } from '@heroicons/react/24/outline'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { PanelGruppe, PanelRad } from '@/components/innstillinger/PanelRad'
import { hentAapneIssues } from '@/app/(app)/innstillinger/IssuesListe'
import { kanAdministrere, godkjennerPassTilgang } from '@/lib/roller'
import { naa } from '@/lib/dato'
import { CHAT_STICKER_MONSTER } from '@/lib/konstanter'
import versjon from '@/lib/versjon.json'
import { KLUBB_NAVN_LINJE_1, KLUBB_NAVN_LINJE_2 } from '@/lib/klubb-config'
import { hentKlubbInfo } from '@/lib/klubb-info'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale'


export default async function Klubbinfo() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  const erAdmin = kanAdministrere(profil?.rolle)

  // «N venter» på Kontrollpanel-raden — samme to kilder som «Saker som venter»
  // i kontrollpanelet. Hentes bare for admin, så ingen andre betaler oppslaget.
  // Startes før count-spørringene under og awaites etter, så de går parallelt.
  // Stiftelse, sted og om-tekst kan admin endre i kontrollpanelet (lib/klubb-info.ts).
  const klubbInfoPromise = hentKlubbInfo()
  const venterPromise = erAdmin ? hentVenterPaaAdmin(godkjennerPassTilgang(profil?.rolle)) : Promise.resolve(0)

  // Seks count-spørringer i parallell — sekvensielt ville lagt fem ekstra
  // rundturer til Supabase på responstiden (jf. ytelseskravet).
  const [
    { count: antallMedlemmer },
    { count: antallAlbumBilder },
    { count: antallChatBilder },
    { count: antallTurer },
    { count: antallKaaringer },
    { count: antallPaaKartet },
  ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('aktiv', true),
      // Antall BILDER, ikke antall album — raden heter «Bilder». Chat-bildene
      // vises som et eget album på /album, så de hører med i totalen.
      supabase.from('album_bilde').select('id', { count: 'exact', head: true }),
      supabase
        .from('klubb_chat')
        .select('id', { count: 'exact', head: true })
        .not('bilde_url', 'is', null)
        .not('bilde_url', 'like', CHAT_STICKER_MONSTER),
      // Turer klubben FAKTISK har vært på: passert start_tidspunkt, og med en
      // destinasjon (en tur uten by vises ikke på /stedene og skal ikke telles).
      // Kommende turer holdes utenfor med vilje — tallet svarer på «hvor mange
      // turer har vi hatt», ikke «hvor mange ligger i kalenderen». Det er også
      // riktigere for blåturer, der destinasjonen er sensurert til den er over.
      supabase
        .from('arrangementer')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'tur')
        .not('destinasjon', 'is', null)
        .lt('start_tidspunkt', naa()),
      // Antall kårede vinnere gjennom historien (én rad per kåring per år).
      supabase.from('kaaring_vinnere').select('id', { count: 'exact', head: true }),
      // Menn som deler posisjon akkurat nå — samme «aktiv»-regel som /kart
      // (deler_til fram i tid). RLS slipper gjennom din egen utløpte rad, så
      // filteret må stå her og ikke overlates til policyen.
      supabase
        .from('posisjon_deling')
        .select('profil_id', { count: 'exact', head: true })
        .gt('deler_til', naa()),
    ])

  const antallBilder = (antallAlbumBilder ?? 0) + (antallChatBilder ?? 0)
  const [venterPaaAdmin, klubbInfo] = await Promise.all([venterPromise, klubbInfoPromise])
  // Hele stiftelsesdatoen formatert på norsk («24. november 2007»).
  // Lokal fast dato uten tidssone-aspekt — new Date(y, m-1, d) er trygt her.
  const stiftetTekst = format(
    new Date(klubbInfo.stiftet.aar, klubbInfo.stiftet.maaned - 1, klubbInfo.stiftet.dag),
    'd. MMMM yyyy',
    { locale: nb },
  )

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Editorial hero */}
      <div
        style={{
          position: 'relative',
          padding: '12px 4px 32px',
          marginBottom: 32,
          borderBottom: '0.5px solid var(--border-subtle)',
          textAlign: 'left',
        }}
      >
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
          Stiftet {stiftetTekst}
          <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPinIcon aria-hidden="true" style={{ width: 11, height: 11 }} />
            {klubbInfo.sted}
          </span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-1.2px',
            lineHeight: 0.95,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {KLUBB_NAVN_LINJE_1}
        </h2>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-secondary)',
            letterSpacing: '-1.2px',
            lineHeight: 0.95,
            margin: '2px 0 0',
          }}
        >
          {KLUBB_NAVN_LINJE_2}
        </h2>

      </div>

      {/* Om klubben */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 600,
          }}
        >
          Om klubben
          <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
        </div>
        {klubbInfo.omAvsnitt.map((avsnitt, i) => (
          <p
            key={i}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              margin: i === klubbInfo.omAvsnitt.length - 1 ? 0 : '0 0 10px',
            }}
          >
            {avsnitt}
          </p>
        ))}
      </div>

      <PanelGruppe tittel="Gjengen">
        <PanelRad
          href="/klubbinfo/medlemmer"
          ikon="users"
          farge="blaa"
          tittel="Medlemmer"
          undertekst="Kontaktinfo og statistikk"
          status={antallMedlemmer || undefined}
        />
        <PanelRad href="/kaaringer" ikon="trophy" farge="sand" tittel="Kåringer" status={antallKaaringer || undefined} />
        <PanelRad href="/arrangoransvar" ikon="list" farge="lilla" tittel="Arrangøransvar" />
        <PanelRad href="/kart" ikon="map" farge="groenn" tittel="Kart" undertekst="Hvor gutta er nå" status={antallPaaKartet ?? undefined} />
      </PanelGruppe>

      <PanelGruppe tittel="Minner">
        <PanelRad href="/album" ikon="image" farge="rosa" tittel="Bilder" status={antallBilder || undefined} />
        <PanelRad href="/stedene" ikon="mapPin" farge="turkis" tittel="Turer" status={antallTurer || undefined} />
      </PanelGruppe>

      <PanelGruppe tittel="Om klubben">
        <PanelRad href="/klubbinfo/vedtekter/vedtekter" ikon="doc" farge="gul" tittel="Vedtekter" />
        {/* Versjonsnummeret bodde tidligere i en egen strek i toppen (#190). */}
        <PanelRad href="/om-appen" ikon="info" farge="graa" tittel="Om appen" status={versjon.versjon} />
      </PanelGruppe>

      {erAdmin && (
        <PanelGruppe tittel="Admin">
          <PanelRad
            href="/innstillinger"
            ikon="cog"
            farge="sand"
            tittel="Kontrollpanel"
            status={venterPaaAdmin > 0 ? `${venterPaaAdmin} venter` : undefined}
            tone={venterPaaAdmin > 0 ? 'varsle' : 'noeytral'}
          />
        </PanelGruppe>
      )}
    </div>
  )
}

async function hentVenterPaaAdmin(erGeneralsekretaer: boolean): Promise<number> {
  const [issues, pass] = await Promise.all([
    hentAapneIssues(),
    // Pass-forespørsler avgjøres bare av generalsekretæren (#582).
    erGeneralsekretaer
      ? createAdminClient()
          .from('pass_tilgang_forespørsel')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'venter')
      : null,
  ])
  // Kaster heller enn å vise en brikke som lyver (Policy: Databasespørringer).
  if (pass?.error) throw new Error(`Kunne ikke telle ventende pass: ${pass.error.message}`)
  return issues.length + (pass?.count ?? 0)
}

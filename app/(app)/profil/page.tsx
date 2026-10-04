import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { norskAar } from '@/lib/dato'
import Avatar from '@/components/ui/Avatar'
import { PanelGruppe, PanelRad } from '@/components/innstillinger/PanelRad'
import { SkjemaGruppe } from '@/components/ui/Skjema'
import { ProfilLenkeRad } from '@/components/profil/ProfilRad'
import UlestVarselRad from '@/components/profil/UlestVarselRad'
import VarslerInnstillinger from '@/components/VarslerInnstillinger'
import EgneOpplysninger from '@/components/profil/EgneOpplysninger'
import PassInfoKort from '@/components/profil/PassInfoKort'
import UtseendeValg from '@/components/profil/UtseendeValg'
import BursdagsgratulasjonToggle from '@/components/BursdagsgratulasjonToggle'
import { kanAdministrere, tittelFor } from '@/lib/roller'
import { lesTemaFraCookie } from '@/lib/tema-server'
import { hentAppFlagg, FOND_FANE } from '@/lib/app-innstillinger'
import { formaterKr, summerKroner } from '@/lib/belop'
import LoggUtKnapp from './LoggUtKnapp'
import { treffflateRundt } from '@/components/ui/Treffflate'

const KLUBBEN_START_AAR = 2007

export default async function Profil() {
  const [supabase, user, valgtTema] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    lesTemaFraCookie(),
  ])

  const [
    { data: profil, error: profilFeil },
    { count: oppmoeter, error: oppmoeterFeil },
    { count: kaaringer, error: kaaringerFeil },
    { data: ansvar, error: ansvarFeil },
    { data: varselPref, error: varselPrefFeil },
    { data: ulesteVarsler, error: ulesteVarslerFeil },
    { count: antallUlesteViktig, error: antallUlesteViktigFeil },
    { data: passInfo, error: passInfoFeil },
    { count: ulestPrivat, error: ulestPrivatFeil },
    { data: fondInnskudd, error: fondInnskuddFeil },
    fondFane,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('navn, visningsnavn, rolle, bilde_url, epost, telefon, fodselsdato, stikkord, matallergier, bursdagsgratulasjon_aktiv')
      .eq('id', user!.id)
      .maybeSingle(),
    supabase
      .from('paameldinger')
      .select('arrangement_id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('status', 'ja'),
    supabase
      .from('kaaring_vinnere')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id),
    supabase
      .from('arrangoransvar')
      .select('id, aar, arrangement_navn')
      .eq('ansvarlig_id', user!.id)
      .gte('aar', norskAar())
      .order('aar'),
    supabase
      .from('varsel_preferanser')
      .select('push_aktiv, epost_aktiv, varsel_nivaa')
      .eq('profil_id', user!.id)
      .maybeSingle(),
    // De tre nyeste ULESTE «Viktig»-varslene til forhåndsvisningen øverst.
    // teller_ulest = true dekker alt utenom de fem chat_*-broadcastene (#612,
    // migrasjon 134); en pass-godkjenning skal ikke kunne drukne i en
    // klubbchat-burst. Hele lista (Viktig/Alt) ligger på /varsler.
    supabase
      .from('varsel_logg')
      .select('id, tittel, opprettet')
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .eq('lest', false)
      .order('opprettet', { ascending: false })
      .limit(3),
    // Total ulest-count for «Viktig» på tvers av hele historikken — vises på
    // «Alle varsler»-raden. MÅ filtreres likt som prikken (harUlestVarsler() i
    // lib/ulest.ts) — ellers lyver tallet og avatar-prikken mot hverandre (#612).
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .eq('lest', false),
    // RLS sørger for at vi kun får egen rad. maybeSingle siden raden
    // ikke nødvendigvis finnes ennå.
    supabase
      .from('pass_info')
      .select('nummer, utloper')
      .eq('profil_id', user!.id)
      .maybeSingle(),
    // Antall uleste privatmeldinger til meg. RLS sørger for at vi kun
    // teller meldinger i samtaler vi deltar i; profil_id != meg ekskluderer
    // egne sendte meldinger. Flyttes hit fra /chat (#256).
    supabase
      .from('samtale_chat')
      .select('id', { count: 'exact', head: true })
      .eq('lest', false)
      .neq('profil_id', user!.id),
    // Egne kontant-innskudd i fondet — summeres til «Min andel av fondet».
    // Kun kontanter (bevisst — eiendom/verdipapir-andeler regnes ikke, jf. #443).
    supabase
      .from('fond_innskudd')
      .select('belop')
      .eq('profil_id', user!.id),
    // Samme synlighetsregel som Fond-taben: admin alltid, medlemmer når bryteren er på
    hentAppFlagg(supabase, FOND_FANE),
  ])

  // Egen profilside — statistikk (oppmøter/kåringer/fondandel) og toggle-
  // tilstander (varselPref) skal aldri vises feilaktig som 0/av på grunn av
  // en svelget feil (Policy: Databasespørringer). .maybeSingle() på profil
  // over: en manglende egen profil-rad her ville uansett vært en dypere
  // inkonsistens enn denne siden kan håndtere pent, så vi kaster på begge.
  if (profilFeil) throw new Error(`Kunne ikke hente profil: ${profilFeil.message}`)
  if (oppmoeterFeil) throw new Error(`Kunne ikke telle oppmøter: ${oppmoeterFeil.message}`)
  if (kaaringerFeil) throw new Error(`Kunne ikke telle kåringer: ${kaaringerFeil.message}`)
  if (ansvarFeil) throw new Error(`Kunne ikke hente arrangøransvar: ${ansvarFeil.message}`)
  if (varselPrefFeil) throw new Error(`Kunne ikke hente varselpreferanser: ${varselPrefFeil.message}`)
  if (ulesteVarslerFeil) throw new Error(`Kunne ikke hente uleste varsler: ${ulesteVarslerFeil.message}`)
  if (antallUlesteViktigFeil) throw new Error(`Kunne ikke telle uleste varsler («Viktig»): ${antallUlesteViktigFeil.message}`)
  if (passInfoFeil) throw new Error(`Kunne ikke hente pass-info: ${passInfoFeil.message}`)
  if (ulestPrivatFeil) throw new Error(`Kunne ikke telle uleste privatmeldinger: ${ulestPrivatFeil.message}`)
  if (fondInnskuddFeil) throw new Error(`Kunne ikke hente fondinnskudd: ${fondInnskuddFeil.message}`)

  const navn = profil?.navn ?? 'Ukjent'
  const rolle = tittelFor(profil?.rolle)
  const ulest = ulestPrivat ?? 0
  // Navnene på hans kommende arrangøransvar (fra i år og utover) som undertekst.
  const ansvarNavn = (ansvar ?? []).map(a => a.arrangement_navn).join(', ')

  // «Min andel av fondet» = summen av egne kontant-innskudd. Følger samme
  // synlighetsregel som Fond-taben (#447): admin ser den alltid, medlemmer
  // først når fond_fane-bryteren er skrudd på.
  const minAndel = summerKroner((fondInnskudd ?? []).map(r => Number(r.belop)))
  const visFondAndel = kanAdministrere(profil?.rolle) || fondFane

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <header
        style={{
          marginTop: 12,
          marginBottom: 26,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.6px',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Medlem siden {KLUBBEN_START_AAR}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 38,
              fontWeight: 500,
              letterSpacing: '-0.5px',
              lineHeight: 1,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            Din profil
          </h1>
        </div>
      </header>

      {/* Profil-hero — kompakt rad (#589). Identiteten lå tidligere som et
          loddrett tårn (avatar 78 + navn + rolle + to stat-kolonner + fond-rad
          = 360 px), og spiste en tredjedel av mobilskjermen før noe handlingsbart
          innhold kom til syne. Samme data, lagt på tvers: ~118 px. */}
      {/* data-testid brukt av e2e/profil-opplysninger.spec.ts (#683) — måler
          hero + Om deg-seksjon til sammen mot høydebudsjettet. */}
      <div
        data-testid="profil-hero"
        style={{
          padding: '14px 16px',
          marginBottom: 20,
          background:
            'radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          backdropFilter: 'var(--blur-card)',
          WebkitBackdropFilter: 'var(--blur-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Avatar
            name={navn}
            size={48}
            src={profil?.bilde_url ?? null}
            rolle={profil?.rolle}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.3px',
                lineHeight: 1.1,
                // Lange navn kappes heller enn å presse fond-tallet ned på en
                // ny linje — hele poenget med raden er at den holder én høyde.
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {navn}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--accent)',
                letterSpacing: '1.8px',
                textTransform: 'uppercase',
                marginTop: 3,
                fontWeight: 600,
              }}
            >
              {rolle}
            </div>
          </div>

          {/* Min andel av fondet — høyrestilt på navnelinja. Etiketten er kortet
              ned fra «Min andel av fondet»; konteksten gir resten. */}
          {/* Lenker til /fond (#607). Trygt uten egen tilgangssjekk: gaten på
              fond-siden er nøyaktig samme uttrykk som visFondAndel over, så
              blokka er kun synlig for den som også slipper inn der. */}
          {visFondAndel && (
            <Link
              href="/fond"
              style={{
                textAlign: 'right',
                flexShrink: 0,
                textDecoration: 'none',
                display: 'block',
                // Blokka er ~35 px høy; usynlig vertikal treffflate (padding + lik negativ margin) opp til 44 px (#700)
                ...treffflateRundt({ hoyde: 33 }).stil,
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 500,
                  color: 'var(--accent)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {formaterKr(minAndel)}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '1.3px',
                  textTransform: 'uppercase',
                  marginTop: 3,
                  fontWeight: 600,
                }}
              >
                Min andel
              </div>
            </Link>
          )}
        </div>

        {/* Stats — tall og etikett side om side på én linje i stedet for to
            kolonner med hver sin høyde. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            marginTop: 12,
            paddingTop: 11,
            borderTop: '0.5px solid var(--border-subtle)',
          }}
        >
          {[
            { val: oppmoeter ?? 0, lbl: 'Oppmøter' },
            { val: kaaringer ?? 0, lbl: 'Kåringer' },
          ].map((s, i) => (
            <div key={s.lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              {i > 0 && <span style={{ color: 'var(--border)', fontSize: 10 }}>•</span>}
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 500,
                    color: 'var(--accent)',
                    lineHeight: 1,
                  }}
                >
                  {s.val}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {s.lbl}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Varsler — de tre nyeste uleste, og lenke til hele lista (/varsler).
          Har han ingen uleste, står bare «Alle varsler»-raden igjen. */}
      <PanelGruppe tittel="Varsler">
        {(ulesteVarsler ?? []).map(v => (
          <UlestVarselRad key={v.id} id={v.id} tittel={v.tittel} opprettet={v.opprettet} />
        ))}
        <ProfilLenkeRad
          href="/varsler"
          etikett="Alle varsler"
          status={(antallUlesteViktig ?? 0) > 0 ? antallUlesteViktig : undefined}
        />
      </PanelGruppe>

      {/* Mitt — privatmeldinger lå her fra #256 (flyttet fra /chat). Arrangøransvaret
          sto tidligere som egen liste på profilen; nå ligger det på /arrangoransvar. */}
      <PanelGruppe tittel="Mitt">
        <PanelRad
          href="/samtaler"
          ikon="message"
          farge="blaa"
          tittel="Privatmeldinger"
          status={ulest > 0 ? ulest : undefined}
          tone={ulest > 0 ? 'varsle' : 'noeytral'}
        />
        <PanelRad
          href="/arrangoransvar"
          ikon="calendar"
          farge="gul"
          tittel="Arrangøransvar"
          undertekst={ansvarNavn || 'Ingen kommende ansvar'}
          status={ansvar?.length ?? 0}
        />
        <PanelRad
          href="/innspill"
          ikon="sparkle"
          farge="lilla"
          tittel="Innspill"
          undertekst="Se innspill du har sendt og svar på dem"
        />
      </PanelGruppe>

      {/* Egne opplysninger (#683) — «Om deg» som rader med etikett/verdi.
          «Rediger profil» er siste rad i samme boks. */}
      <EgneOpplysninger
        navn={navn}
        visningsnavn={profil?.visningsnavn ?? null}
        fodselsdato={profil?.fodselsdato ?? null}
        telefon={profil?.telefon ?? null}
        epost={profil?.epost ?? ''}
        matallergier={profil?.matallergier ?? null}
        stikkord={profil?.stikkord ?? null}
      >
        <ProfilLenkeRad href="/profil/rediger" etikett="Rediger profil" aksent />
      </EgneOpplysninger>

      <VarslerInnstillinger
        pushAktiv={varselPref?.push_aktiv ?? false}
        epostAktiv={varselPref?.epost_aktiv ?? true}
        varselNivaa={varselPref?.varsel_nivaa === 'viktige' ? 'viktige' : 'alle'}
      />

      <UtseendeValg initial={valgtTema} />

      {/* Automatisering — per-admin, gjelder bare den innloggede. Lå tidligere i
          kontrollpanelet, der den så ut som en bryter for hele klubben. */}
      {kanAdministrere(profil?.rolle) && (
        <SkjemaGruppe tittel="Automatisering">
          <BursdagsgratulasjonToggle aktiv={profil?.bursdagsgratulasjon_aktiv ?? false} />
        </SkjemaGruppe>
      )}

      {/* Pass-info — synlig kun for eier (RLS). PassInfoKort bærer boksen selv. */}
      <PassInfoKort nummer={passInfo?.nummer ?? null} utloper={passInfo?.utloper ?? null} />

      <LoggUtKnapp />
    </div>
  )
}

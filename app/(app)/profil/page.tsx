import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { norskAar } from '@/lib/dato'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import SectionLabel from '@/components/ui/SectionLabel'
import VarslerInnstillinger from '@/components/VarslerInnstillinger'
import VarslerListe from '@/components/profil/VarslerListe'
import PassInfoKort from '@/components/profil/PassInfoKort'
import UtseendeValg from '@/components/profil/UtseendeValg'
import { kanAdministrere, tittelFor } from '@/lib/roller'
import { lesTemaFraCookie } from '@/lib/tema-server'
import { hentAppFlagg, FOND_FANE } from '@/lib/app-innstillinger'
import { formaterKr, summerKroner } from '@/lib/belop'
import LoggUtKnapp from './LoggUtKnapp'

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
    { data: varslerViktig, error: varslerViktigFeil },
    { data: varslerAlt, error: varslerAltFeil },
    { count: antallUlesteViktig, error: antallUlesteViktigFeil },
    { count: antallUlesteAlt, error: antallUlesteAltFeil },
    { data: passInfo, error: passInfoFeil },
    { count: ulestPrivat, error: ulestPrivatFeil },
    { data: fondInnskudd, error: fondInnskuddFeil },
    fondFane,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('navn, visningsnavn, rolle, bilde_url')
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
      .select('id, aar, arrangement_navn, arrangement_id, arrangementer (id, tittel, start_tidspunkt, oppmoetested)')
      .eq('ansvarlig_id', user!.id)
      .gte('aar', norskAar())
      .order('aar'),
    supabase
      .from('varsel_preferanser')
      .select('push_aktiv, epost_aktiv')
      .eq('profil_id', user!.id)
      .maybeSingle(),
    // «Viktig» — default-fanen. teller_ulest = true dekker alt utenom de fem
    // chat_*-broadcastene (#612, migrasjon 134); en pass-godkjenning skal
    // ikke kunne drukne i en klubbchat-burst.
    supabase
      .from('varsel_logg')
      .select('id, tittel, melding, lest, opprettet, url')
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .order('opprettet', { ascending: false })
      .limit(10),
    // «Alt» — hele historikken, chat inkludert.
    supabase
      .from('varsel_logg')
      .select('id, tittel, melding, lest, opprettet, url')
      .eq('profil_id', user!.id)
      .order('opprettet', { ascending: false })
      .limit(10),
    // Total ulest-count for «Viktig» på tvers av hele historikken — listen
    // viser kun top 10, men "Marker alle som lest"-knappen og tellingen i
    // tittelen må kjenne til alle uleste, også de eldre enn topp 10 (#207).
    // MÅ filtreres likt som prikken (harUlestVarsler() i lib/ulest.ts) —
    // ellers lyver tittelen og avatar-prikken mot hverandre (#612).
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .eq('lest', false),
    // Uleste i «Alt» — ALLE uleste, ikke bare chat-radene (#612-review).
    // Badgen står på en fane som viser hele historikken, så den må telle det
    // fanen faktisk inneholder: med 3 uleste viktige + 12 uleste chat sto det
    // før «Alt · 12» på en fane med 15 uleste. Filteret på teller_ulest = false
    // hørte til den forrige varianten der badgen skulle bety «chat».
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
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
  if (varslerViktigFeil) throw new Error(`Kunne ikke hente varsler («Viktig»): ${varslerViktigFeil.message}`)
  if (varslerAltFeil) throw new Error(`Kunne ikke hente varsler («Alt»): ${varslerAltFeil.message}`)
  if (antallUlesteViktigFeil) throw new Error(`Kunne ikke telle uleste varsler («Viktig»): ${antallUlesteViktigFeil.message}`)
  if (antallUlesteAltFeil) throw new Error(`Kunne ikke telle uleste varsler («Alt»): ${antallUlesteAltFeil.message}`)
  if (passInfoFeil) throw new Error(`Kunne ikke hente pass-info: ${passInfoFeil.message}`)
  if (ulestPrivatFeil) throw new Error(`Kunne ikke telle uleste privatmeldinger: ${ulestPrivatFeil.message}`)
  if (fondInnskuddFeil) throw new Error(`Kunne ikke hente fondinnskudd: ${fondInnskuddFeil.message}`)

  const navn = profil?.navn ?? 'Ukjent'
  const rolle = tittelFor(profil?.rolle)
  const ulest = ulestPrivat ?? 0

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

        <Link
          href="/profil/rediger"
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 999,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          Rediger
        </Link>
      </header>

      {/* Profil-hero — kompakt rad (#589). Identiteten lå tidligere som et
          loddrett tårn (avatar 78 + navn + rolle + to stat-kolonner + fond-rad
          = 360 px), og spiste en tredjedel av mobilskjermen før noe handlingsbart
          innhold kom til syne. Samme data, lagt på tvers: ~118 px. */}
      <div
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

      {/* Privatmeldinger — flyttes hit fra /chat (#256) slik at lenken
          er tilgjengelig fra profil-siden, ikke fra klubb-chat. */}
      <Link
        href="/samtaler"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          marginBottom: 22,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Icon name="message" size={18} color="var(--accent)" strokeWidth={1.6} />
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-primary)',
          }}
        >
          Privatmeldinger
        </span>
        {ulest > 0 && (
          <span
            style={{
              minWidth: 20,
              height: 20,
              padding: '0 7px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ulest}
          </span>
        )}
        <Icon name="chevron" size={14} color="var(--text-tertiary)" />
      </Link>

      {/* Arrangøransvar */}
      {ansvar && ansvar.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Arrangøransvar</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ansvar.map((a, i) => {
              const lagtInn = !!a.arrangement_id
              const arr = Array.isArray(a.arrangementer)
                ? a.arrangementer[0]
                : a.arrangementer
              const meta = arr
                ? arr.oppmoetested ?? '—'
                : 'Dato og sted ikke satt'
              const farge = lagtInn ? 'var(--success)' : 'var(--danger)'
              return (
                <Link
                  key={a.id}
                  href={arr ? `/arrangementer/${arr.id}` : '/arrangoransvar'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 4px',
                    borderBottom:
                      i < ansvar.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: farge,
                      flexShrink: 0,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${farge} 18%, transparent)`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '1.6px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {a.aar}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.2px',
                        lineHeight: 1.15,
                        marginBottom: 3,
                      }}
                    >
                      {a.arrangement_navn}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '0.1px',
                      }}
                    >
                      {meta}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: farge,
                      letterSpacing: '1.4px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {lagtInn ? 'Lagt inn' : 'Ikke lagt inn'}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Varsler-innstillinger */}
      <VarslerInnstillinger
        pushAktiv={varselPref?.push_aktiv ?? false}
        epostAktiv={varselPref?.epost_aktiv ?? true}
      />

      {/* Utseende-innstillinger — alle kan velge tema */}
      <UtseendeValg initial={valgtTema} />

      {/* Personlige varsler — interaktiv klient-komponent med «Viktig»/«Alt»-
          segment, filter, kollaps og marker-alle-lest. Vis seksjonen hvis det
          finnes noe i EN av de to listene, ELLER uleste eldre enn topp 10 i
          en av dem (se #207, utvidet med «Alt» i #612). */}
      {((varslerViktig && varslerViktig.length > 0) ||
        (varslerAlt && varslerAlt.length > 0) ||
        (antallUlesteViktig ?? 0) > 0 ||
        (antallUlesteAlt ?? 0) > 0) && (
        <VarslerListe
          varslerViktig={varslerViktig ?? []}
          varslerAlt={varslerAlt ?? []}
          antallUlesteViktigTotal={antallUlesteViktig ?? 0}
          antallUlesteAltTotal={antallUlesteAlt ?? 0}
        />
      )}

      {/* Pass og Innspill samlet nederst — sjeldent brukt, eller mest praktisk
          å nå når man scroller forbi det viktige (varsler, ansvar). */}

      {/* Pass-info — synlig kun for eier (RLS) */}
      <section style={{ marginTop: 32, marginBottom: 24 }}>
        <SectionLabel>Pass</SectionLabel>
        <PassInfoKort
          nummer={passInfo?.nummer ?? null}
          utloper={passInfo?.utloper ?? null}
        />
      </section>

      {/* Innspill */}
      <section style={{ marginBottom: 24 }}>
        <SectionLabel>Innspill</SectionLabel>
        <Link
          href="/innspill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 4px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.2px',
                lineHeight: 1.15,
                marginBottom: 3,
              }}
            >
              Dine innspill
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1px',
              }}
            >
              Se innspill du har sendt inn og svar på håndterte saker
            </div>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--text-tertiary)',
              fontWeight: 400,
            }}
          >
            →
          </span>
        </Link>
      </section>

      {/* Logg ut */}
      <div style={{ marginTop: 28 }}>
        <LoggUtKnapp />
      </div>
    </div>
  )
}

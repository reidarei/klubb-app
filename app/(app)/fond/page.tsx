import { notFound } from 'next/navigation'
import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import Card from '@/components/ui/Card'
import InnskyterRad from '@/components/fond/InnskyterRad'
import FondPostRad from '@/components/fond/FondPostRad'
import Avkastning from '@/components/fond/Avkastning'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { formaterDato } from '@/lib/dato'
import { formaterKr, formaterBelop } from '@/lib/belop'
import { KLUBB_KORTNAVN, FOND_KONTONUMMER, FOND_FAST_TREKK_FORSLAG } from '@/lib/klubb-config'
import { hentAppFlagg, FOND_FANE } from '@/lib/app-innstillinger'

// ─── Formateringshjelpere (beholdes fra godkjent mockup) ─────────────────────

// Delt formattering i lib/belop.ts — brukes også av profil-sidens fond-andel
const kr = formaterKr

// Avkastning bor nå i components/fond/Avkastning.tsx — FondPostRad trenger
// den også, og en klientkomponent kan ikke importere fra en server-side
// page-fil. Se #555.

// ─── Side (async RSC) ─────────────────────────────────────────────────────────

export default async function FondSide() {
  const supabase = await createServerClient()
  // Hent profil og fond-flagget parallelt — unngår sekvensiell DB-runde.
  const [profil, fondFane] = await Promise.all([
    getProfil(),
    hentAppFlagg(supabase, FOND_FANE),
  ])
  // Gating: admin har alltid tilgang. Vanlige medlemmer får tilgang når
  // bryteren i /innstillinger (app_innstillinger.fond_fane) er skrudd på (#447).
  if (!kanAdministrere(profil?.rolle) && !fondFane) return notFound()

  // Hent alle fond-data parallelt
  const [
    { data: eiendommer, error: eiendommerFeil },
    { data: verdipapirer, error: verdipapirerFeil },
    { data: innskudd, error: innskuddFeil },
    { data: kontant, error: kontantFeil },
    { data: bevegelser, error: bevegelserFeil },
  ] = await Promise.all([
    supabase.from('fond_eiendom').select('*').order('navn'),
    supabase.from('fond_verdipapir').select('*').order('navn'),
    supabase
      .from('fond_innskudd')
      .select('*, profiles(navn, visningsnavn, bilde_url, rolle)')
      .order('dato', { ascending: false }),
    supabase.from('fond_kontant').select('saldo, oppdatert').eq('id', 1).maybeSingle(),
    // Bevegelsene hentes med sidelasten, ikke ved trykk på en rad: ~17 personer
    // × ~12 bevegelser er neglisjerbart i payload, og alternativet ville lagt en
    // nettverksrunde inn i en interaksjon som skal føles umiddelbar.
    supabase
      .from('fond_bevegelse')
      .select('profil_id, dato, belop')
      .order('dato', { ascending: true }),
  ])
  // Totalverdi er en sum på tvers av alle fire kildene — en feilet delspørring
  // ville stille vist en for lav (løgnaktig) totalverdi i stedet for å feile
  // synlig. Kaster på alle fire (Policy: Databasespørringer, aggregater).
  if (eiendommerFeil) throw new Error(`Kunne ikke hente eiendommer: ${eiendommerFeil.message}`)
  if (verdipapirerFeil) throw new Error(`Kunne ikke hente verdipapirer: ${verdipapirerFeil.message}`)
  if (innskuddFeil) throw new Error(`Kunne ikke hente innskudd: ${innskuddFeil.message}`)
  if (kontantFeil) throw new Error(`Kunne ikke hente kontantsaldo: ${kontantFeil.message}`)
  // Bevegelsene er en oppdeling av tall som allerede vises. Feiler spørringen og
  // vi bare lot listen være tom, ville radene sett uutvidbare ut — altså «det
  // finnes ingen bevegelser», som er en påstand vi ikke har grunnlag for. Kaster.
  if (bevegelserFeil) throw new Error(`Kunne ikke hente fondsbevegelser: ${bevegelserFeil.message}`)

  // Aggregater — tåler 0-verdier og tomme lister
  const eiendomListe = eiendommer ?? []
  const vpListe = verdipapirer ?? []
  const innskuddListe = innskudd ?? []
  const kontantSaldo = kontant?.saldo ?? 0

  // Bevegelser gruppert per profil, i datorekkefølge (spørringen sorterer).
  // Number() fordi PostgREST kan serialisere numeric som string.
  const bevegelserPerProfil = new Map<string, { dato: string; belop: number }[]>()
  for (const b of bevegelser ?? []) {
    const liste = bevegelserPerProfil.get(b.profil_id) ?? []
    liste.push({ dato: b.dato, belop: Number(b.belop) })
    bevegelserPerProfil.set(b.profil_id, liste)
  }

  const eiendomSum = eiendomListe.reduce((s, e) => s + e.markedsverdi, 0)
  const vpVerdi = vpListe.reduce((s, v) => s + v.verdi, 0)
  const vpInngang = vpListe.reduce((s, v) => s + v.anskaffelsesverdi, 0)
  const vpAvkastning = vpVerdi - vpInngang
  const totalverdi = eiendomSum + vpVerdi + kontantSaldo

  // «Per <dato>» — seneste oppdatert-tidsstempel på tvers av kildene
  const tidsstempler = [
    ...eiendomListe.map(e => e.oppdatert),
    ...vpListe.map(v => v.oppdatert),
    ...(kontant?.oppdatert ? [kontant.oppdatert] : []),
  ]
  const sistOppdatert = tidsstempler.length > 0
    ? tidsstempler.reduce((a, b) => (a > b ? a : b))
    : null
  const perDato = sistOppdatert
    ? formaterDato(sistOppdatert, "d. MMMM yyyy")
    : null

  return (
    <div style={{ padding: '0 20px 32px' }}>
      {/* Editorial hero — matcher klubbinfo-stilen */}
      <div
        style={{
          padding: '12px 4px 26px',
          marginBottom: 28,
          borderBottom: '0.5px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          {/* Genitiv-s på kortnavnet — etiketten følger klubb-instansens navn */}
          {KLUBB_KORTNAVN}s fond
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Totalverdi
          {perDato && (
            <>
              <span aria-hidden="true" style={{ opacity: 0.4 }}> · </span>
              Per {perDato}
            </>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-1.2px',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {kr(totalverdi)}
        </div>

        {/* Nøkkeltall per aktivaklasse */}
        <div
          style={{
            display: 'flex',
            gap: 22,
            marginTop: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          {[
            { val: eiendomSum, lbl: 'Eiendom' },
            { val: vpVerdi, lbl: 'Verdipapirer' },
            { val: kontantSaldo, lbl: 'Kontanter' },
          ].map(s => (
            <div key={s.lbl}>
              <div
                style={{
                  color: 'var(--accent)',
                  fontSize: 15,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.3px',
                  marginBottom: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formaterBelop(s.val)}
              </div>
              {s.lbl}
            </div>
          ))}
        </div>

        {/* Rediger-knapp — kun for admin (medlemmer har ikke tilgang til /fond/rediger).
            Synlig pille i profil-sidens stil; den gamle 9px-lenken var usynlig på mobil. */}
        {kanAdministrere(profil?.rolle) && (
          <div style={{ marginTop: 18 }}>
            <Link
              href="/fond/rediger"
              style={{
                display: 'inline-block',
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
            >
              Rediger fondet
            </Link>
          </div>
        )}
      </div>

      {/* Eiendommer */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={eiendomListe.length}>Eiendommer</SectionLabel>
        <Card padding={false}>
          {eiendomListe.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-tertiary)',
              }}
            >
              Ingen eiendommer
            </div>
          ) : (
            <>
              {eiendomListe.map((e, i) => (
                <FondPostRad
                  key={e.id}
                  navn={e.navn}
                  undertekst={`Anskaffelsesverdi ${kr(e.anskaffelsesverdi)}`}
                  verdi={e.markedsverdi}
                  anskaffelsesverdi={e.anskaffelsesverdi}
                  // Året tas fra postens oppdatert-dato, ikke dagens — ellers
                  // ville etiketten skiftet år 1. januar, før noen har lagt
                  // inn nye tall (jf. Policy: Tidshåndtering).
                  aar={Number(formaterDato(e.oppdatert, 'yyyy'))}
                  linjer={[
                    { etikett: 'Husleie', belop: e.husleie_i_aar },
                    { etikett: 'Driftskostnader', belop: e.driftskostnader_i_aar, erKostnad: true },
                  ]}
                  sisteRad={i === eiendomListe.length - 1}
                />
              ))}
              {/* Sum-rad — kun når rader finnes */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '12px 16px',
                  borderTop: '0.5px solid var(--border-strong)',
                  background: 'var(--bg-elevated-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Markedsverdi
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {kr(eiendomSum)}
                </span>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Aksjer og fond */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={vpListe.length}>Aksjer og fond</SectionLabel>
        <Card padding={false}>
          {vpListe.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-tertiary)',
              }}
            >
              Ingen aksjer eller fond
            </div>
          ) : (
            <>
              {vpListe.map((v, i) => (
                <FondPostRad
                  key={v.id}
                  navn={v.navn}
                  undertekst={`Anskaffelsesverdi ${kr(v.anskaffelsesverdi)}`}
                  verdi={v.verdi}
                  anskaffelsesverdi={v.anskaffelsesverdi}
                  aar={Number(formaterDato(v.oppdatert, 'yyyy'))}
                  // Kun én linje her — et verdipapir har ingen driftskostnad
                  // å trekke fra, så FondPostRad utelater netto-raden.
                  linjer={[{ etikett: 'Utbytte', belop: v.utbytte_i_aar }]}
                  sisteRad={i === vpListe.length - 1}
                />
              ))}
              {/* Sum-rad med samlet avkastning — kun når rader finnes */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '12px 16px',
                  borderTop: '0.5px solid var(--border-strong)',
                  background: 'var(--bg-elevated-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Totalt
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <Avkastning
                    kroner={vpAvkastning}
                    pst={vpInngang > 0 ? (vpAvkastning / vpInngang) * 100 : 0}
                    size={13}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {kr(vpVerdi)}
                  </span>
                </span>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Kontantbeholdning */}
      <section>
        <SectionLabel>Kontantbeholdning</SectionLabel>
        <Card padding={false}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '14px 16px',
              borderBottom: innskuddListe.length > 0 ? '0.5px solid var(--border-subtle)' : 'none',
            }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
              På konto
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kr(kontantSaldo)}
            </span>
          </div>

          {/* Innskyter-blokk — kun synlig når innskudd finnes */}
          {innskuddListe.length > 0 && (
            <>
              <div
                style={{
                  padding: '10px 16px 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                Tilhører innskytere
              </div>
              {innskuddListe.map((inn, i) => {
                // Supabase join returnerer profiles som objekt (eller null)
                const p = inn.profiles as { navn: string; visningsnavn: string; bilde_url: string | null; rolle: string | null } | null
                const navn = p?.navn ?? 'Ukjent'
                // Kallenavnet er det gutta kjenner hverandre som — fullt navn kun som Avatar-hue-kilde
                const kallenavn = p?.visningsnavn ?? navn.split(' ')[0]
                // Vis bare bevegelser fra året andelen gjelder. Tabellen beholder
                // eldre år, så uten filteret ville en import av neste år dratt
                // forrige års linjer inn i samme oppdeling.
                const aar = inn.dato.slice(0, 4)
                const egneBevegelser = (bevegelserPerProfil.get(inn.profil_id) ?? []).filter(
                  b => b.dato.slice(0, 4) === aar,
                )
                return (
                  <InnskyterRad
                    key={inn.id}
                    navn={navn}
                    kallenavn={kallenavn}
                    bildeUrl={p?.bilde_url ?? null}
                    rolle={p?.rolle ?? null}
                    dato={inn.dato}
                    belop={Number(inn.belop)}
                    oppspartAkkumulert={Number(inn.oppspart_akkumulert)}
                    renteandelIFjor={Number(inn.renteandel_i_fjor)}
                    bevegelser={egneBevegelser}
                    sisteRad={i === innskuddListe.length - 1}
                  />
                )
              })}
            </>
          )}

          {/* Oppfordring om fast trekk — Michaels ønske (#477). Skjules når
              instansen ikke har satt fondskonto (tom FOND_KONTONUMMER). */}
          {FOND_KONTONUMMER && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '0.5px solid var(--border-subtle)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Har du ikke fast trekk ennå? Sett opp et fast trekk på f.eks.{' '}
              {FOND_FAST_TREKK_FORSLAG} i måneden til konto{' '}
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {FOND_KONTONUMMER}
              </span>
              {' '}— så vokser fondet av seg sjæl.
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}

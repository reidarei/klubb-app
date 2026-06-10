// Skjermene — Hjem (agenda/tidslinje), Klubbinfo, Kåringer, Profil, + Arrangement-detalj

// Mock-data
const ARRANGEMENTER = [
  {
    id: '1',
    type: 'tur',
    tittel: 'Sommertur til Hvaler',
    dato: '12. jun · 14:00',
    mnd: 'JUN', dag: '12',
    sted: 'Oslo Havn, kai 3',
    destinasjon: 'Hvaler · Skjærhalden',
    pris: '4 200',
    antallJa: 11,
    deltakere: ['Reidar', 'Lars Ove', 'Ståle', 'Bjørn', 'Øyvind', 'Geir', 'Knut', 'Tom', 'Petter', 'Erlend', 'Mads'],
    status: 'ja',
    highlight: true,
  },
  {
    id: '2',
    type: 'møte',
    tittel: 'Månedsmøte · mai',
    dato: '28. mai · 19:30',
    mnd: 'MAI', dag: '28',
    sted: 'Bjørns stue',
    antallJa: 8,
    deltakere: ['Reidar', 'Lars Ove', 'Bjørn', 'Ståle', 'Øyvind', 'Geir', 'Knut', 'Tom'],
    status: 'kanskje',
  },
  {
    id: '3',
    type: 'tur',
    tittel: 'Whiskysmaking · Isle of Islay',
    dato: '14. sep · 18:00',
    mnd: 'SEP', dag: '14',
    sted: 'The Library, Grünerløkka',
    pris: '850',
    antallJa: 13,
    deltakere: ['Reidar', 'Lars Ove', 'Ståle', 'Bjørn', 'Øyvind', 'Geir', 'Knut', 'Tom', 'Petter', 'Erlend', 'Mads', 'Jan-Erik', 'Morten'],
    status: 'ja',
  },
];

const BURSDAGER = [
  { navn: 'Ståle', alder: 54, dato: '7. jun' },
];

// Utkast — arrangementer som er "planlagt", men ikke ennå opprettet
const UTKAST = [
  {
    id: 'u1',
    type: 'møte',
    tittel: 'Mai-juni-møtet',
    periode: '2026 · Vår',
    mnd: 'JUN', dag: '01',
    ansvarlig: 'Reidar',
  },
];

// Tidligere arrangementer — avholdt, størst først (nyeste)
const TIDLIGERE = [
  {
    id: 't1',
    type: 'møte',
    tittel: 'April-møtet',
    dato: '24. apr · 19:30',
    mnd: 'APR', dag: '24',
    sted: 'Bjørns stue',
    antallJa: 12,
    status: 'ja',
  },
  {
    id: 't2',
    type: 'tur',
    tittel: 'Påsketømmer · Hafjell',
    dato: '28. mar · 17:00',
    mnd: 'MAR', dag: '28',
    sted: 'Hafjell',
    antallJa: 9,
    status: 'ja',
  },
  {
    id: 't3',
    type: 'tur',
    tittel: 'Jørgens 60-årsdag',
    dato: '15. mar · 20:00',
    mnd: 'MAR', dag: '15',
    sted: 'Restaurant Hos Thea',
    antallJa: 15,
    status: 'ja',
  },
];

// ──────────── HJEM ────────────
function HjemSkjerm({ theme }) {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Hero — eksklusiv klubb-innledning */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 26,
      }}>
        <div>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 10,
            color: theme.textTertiary, letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: 6,
          }}>
            Siden 2015 · 17 gutta
          </div>
          <h1 style={{
            fontFamily: theme.fontDisplay,
            fontSize: 38, fontWeight: 500,
            color: theme.textPrimary,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
          }}>
            Agenda
          </h1>
        </div>
        <button style={{
          width: 44, height: 44, borderRadius: '50%',
          border: `1px solid ${theme.borderStrong}`,
          background: theme.accentSoft,
          color: theme.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Icon name="plus" size={20} color={theme.accent} strokeWidth={2} />
        </button>
      </div>

      {/* I dag-kort — utheving */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel theme={theme}>I dag · 28. mai</SectionLabel>
        <HighlightKort arr={ARRANGEMENTER[1]} theme={theme} />
      </div>

      {/* Kommende */}
      <div style={{ marginBottom: 20 }}>
        <SectionLabel theme={theme}>Kommende</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <UtkastKort utkast={UTKAST[0]} theme={theme} />
          <BursdagKort bursdag={BURSDAGER[0]} theme={theme} />
          <ArrangementKort arr={ARRANGEMENTER[0]} theme={theme} />
          <ArrangementKort arr={ARRANGEMENTER[2]} theme={theme} />
        </div>
      </div>

      {/* Innspill — egen seksjon med SectionLabel */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel theme={theme}>Savner du noe? Opplever du feil?</SectionLabel>
        <InnspillKnapp theme={theme} />
      </div>

      {/* Tidligere */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel theme={theme}>Tidligere</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {TIDLIGERE.map(t => (
            <ArrangementKort key={t.id} arr={t} theme={theme} tidligere />
          ))}
        </div>
      </div>
    </div>
  );
}

// Innspill-knapp — meta-feedback (forbedringer / bugs til appen)
// Samme form som "Logg ut"-knappen: fullbredde, sentrert, transparent med border.
// Accent-farget tekst (ikke danger) fordi det er et positivt CTA.
function InnspillKnapp({ theme }) {
  return (
    <button style={{
      width: '100%',
      padding: '14px 0',
      background: 'transparent',
      border: `1px solid ${theme.border}`,
      borderRadius: 999,
      color: theme.accent,
      fontFamily: theme.fontBody, fontSize: 14, fontWeight: 500,
      letterSpacing: '0.2px',
      cursor: 'pointer',
    }}>
      Send innspill
    </button>
  );
}

function HighlightKort({ arr, theme }) {
  return (
    <Card theme={theme} style={{
      padding: 0,
      border: `1px solid ${theme.borderStrong}`,
      boxShadow: `0 8px 30px ${theme.accentSoft}, 0 0 0 1px ${theme.borderStrong}`,
      position: 'relative',
    }}>
      <Placeholder theme={theme} label={`IMAGE · ${arr.type}`} aspectRatio="16/10" type={arr.type} />
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: theme.accentHot, color: '#1a1208',
        padding: '4px 10px', borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
        textTransform: 'uppercase', fontFamily: theme.fontBody,
      }}>I kveld</div>
      <div style={{ padding: '18px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Pill theme={theme} variant="accent" small>{arr.type}</Pill>
          <span style={{ fontSize: 12, color: theme.textSecondary, fontFamily: theme.fontBody }}>
            {arr.dato}
          </span>
        </div>
        <h3 style={{
          fontFamily: theme.fontDisplay, fontSize: 22, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.3px',
          margin: '0 0 8px', lineHeight: 1.15,
        }}>{arr.tittel}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="mapPin" size={13} color={theme.textTertiary} />
          <span style={{ fontSize: 13, color: theme.textSecondary, fontFamily: theme.fontBody }}>
            {arr.sted}
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14, marginTop: 2,
          borderTop: `1px solid ${theme.borderSubtle}`,
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {arr.deltakere.slice(0, 3).map((n, i) => (
              <div key={i} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}>
                <Avatar name={n} size={24} theme={theme} />
              </div>
            ))}
            <span style={{
              marginLeft: 10, fontSize: 12, color: theme.textSecondary,
              fontFamily: theme.fontBody, whiteSpace: 'nowrap',
            }}>
              {arr.antallJa} påmeldt
            </span>
          </div>
          <Pill theme={theme} variant={arr.status === 'ja' ? 'success' : 'accent'}>
            {arr.status === 'ja' ? '✓ Du er med' : '? Kanskje'}
          </Pill>
        </div>
      </div>
    </Card>
  );
}

function ArrangementKort({ arr, theme, tidligere = false }) {
  return (
    <Card theme={theme} style={{
      padding: 0, display: 'flex', gap: 0, alignItems: 'stretch',
      overflow: 'hidden',
      opacity: tidligere ? 0.62 : 1,
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '14px 14px 14px 16px',
      }}>
        {/* Liten dato-label øverst */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.accent, letterSpacing: '1.6px', fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          <span>{arr.mnd} {arr.dag}</span>
          <span style={{ color: theme.textTertiary, letterSpacing: '1.2px' }}>
            · {arr.dato.split('·')[1]?.trim()}
          </span>
        </div>
        <h3 style={{
          fontFamily: theme.fontDisplay, fontSize: 18, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.2px',
          margin: '0 0 6px', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{arr.tittel}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Icon name="mapPin" size={11} color={theme.textTertiary} />
          <span style={{
            fontSize: 12, color: theme.textSecondary, fontFamily: theme.fontBody,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{arr.sted}</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: theme.textTertiary,
          fontFamily: theme.fontBody,
        }}>
          {tidligere ? (
            <>
              <Icon name="checkmark" size={11} color={theme.textTertiary} strokeWidth={1.8} />
              <span>{arr.antallJa} deltok</span>
            </>
          ) : (
            <>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: arr.status === 'ja' ? '#7cc99a' : arr.status === 'kanskje' ? theme.accent : theme.textTertiary,
              }} />
              {arr.antallJa} påmeldt · {arr.status === 'ja' ? 'Du er med' : arr.status === 'kanskje' ? 'Du svarte kanskje' : 'Ikke svart'}
            </>
          )}
        </div>
      </div>

      {/* Bilde helt til høyre, fyller hele høyden */}
      <div style={{
        width: 108, flexShrink: 0,
        position: 'relative',
        borderLeft: `0.5px solid ${theme.borderSubtle}`,
        background: arr.type === 'tur'
          ? `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
             linear-gradient(135deg, oklch(0.22 0.03 230), oklch(0.14 0.04 260))`
          : arr.type === 'møte'
          ? `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
             linear-gradient(135deg, oklch(0.2 0.02 40), oklch(0.12 0.02 30))`
          : `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
             linear-gradient(135deg, oklch(0.2 0.03 200), oklch(0.13 0.03 220))`,
        overflow: 'hidden',
      }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
          <defs>
            <pattern id={`thumb-stripes-${arr.id}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="4" height="8" fill={theme.accent} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#thumb-stripes-${arr.id})`} />
        </svg>
      </div>
    </Card>
  );
}

function UtkastKort({ utkast, theme }) {
  return (
    <div style={{
      display: 'flex', gap: 0, alignItems: 'stretch',
      overflow: 'hidden',
      borderRadius: 14,
      border: `1px dashed ${theme.borderStrong}`,
      background: 'transparent',
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '14px 14px 14px 16px',
      }}>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '1.6px', fontWeight: 600,
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Utkast
        </div>
        <h3 style={{
          fontFamily: theme.fontDisplay, fontSize: 18, fontWeight: 500,
          color: theme.textSecondary, letterSpacing: '-0.2px',
          margin: '0 0 6px', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{utkast.tittel}</h3>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: theme.textTertiary,
          fontFamily: theme.fontBody,
        }}>
          <span style={{ color: theme.textSecondary }}>{utkast.ansvarlig}</span>
          <span>skal arrangere</span>
        </div>
      </div>

      {/* Spørsmålstegn helt til høyre, i stedet for bilde */}
      <div style={{
        width: 108, flexShrink: 0,
        position: 'relative',
        borderLeft: `1px dashed ${theme.borderStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: theme.fontDisplay,
          fontSize: 54, fontWeight: 300,
          color: theme.textTertiary,
          letterSpacing: '-2px',
          lineHeight: 1,
          opacity: 0.55,
        }}>?</div>
      </div>
    </div>
  );
}

function BursdagKort({ bursdag, theme }) {
  const [dag, mnd] = bursdag.dato.split('.');
  const mndKort = (mnd || '').trim().slice(0, 3).toUpperCase();
  return (
    <div style={{
      display: 'flex', gap: 0, alignItems: 'stretch',
      padding: 0,
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '14px 14px 14px 16px',
      }}>
        {/* Samme dato-label som ArrangementKort */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '1.6px', fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          <span>{mndKort} {dag.trim()}</span>
        </div>
        <h3 style={{
          fontFamily: theme.fontDisplay, fontSize: 18, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.2px',
          margin: 0, lineHeight: 1.2,
        }}>
          {bursdag.navn} <span style={{ color: theme.textTertiary, fontWeight: 400 }}>fyller {bursdag.alder}</span>
        </h3>
      </div>

      <div style={{
        width: 64, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="wine" size={22} color={theme.textTertiary} strokeWidth={1.25} />
      </div>
    </div>
  );
}

// ──────────── KLUBBINFO ────────────
function KlubbinfoSkjerm({ theme }) {
  const rows = [
    { nr: '01', icon: 'users', title: 'Medlemmer', sub: '17 aktive · 3 æresmedlemmer', meta: '17' },
    { nr: '02', icon: 'list', title: 'Arrangøransvar', sub: 'Hvem tar hva i 2026' },
    { nr: '03', icon: 'doc', title: 'Vedtekter', sub: 'Regler og kvotering' },
    { nr: '04', icon: 'building', title: 'Historikk', sub: 'Klubbens krønike siden 2015' },
    { nr: '05', icon: 'chart', title: 'Statistikk', sub: 'Deltakelse og rekorder' },
    { nr: '06', icon: 'cog', title: 'Innstillinger', sub: 'Varsler og admin' },
  ];
  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Typografisk hero — klubbnavn som statement */}
      <div style={{
        position: 'relative',
        padding: '12px 4px 32px',
        marginBottom: 32,
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
        textAlign: 'left',
      }}>
        {/* Mono-label som et "kapittelmerke" */}
        <div style={{
          fontFamily: theme.fontMono, fontSize: 9,
          color: theme.textTertiary, letterSpacing: '2.5px',
          textTransform: 'uppercase', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 18, height: '0.5px', background: theme.borderStrong }} />
          Etablert 2015
        </div>
        <h2 style={{
          fontFamily: theme.fontDisplay, fontSize: 44, fontWeight: 400,
          color: theme.textPrimary, letterSpacing: '-1.2px',
          lineHeight: 0.95, margin: 0,
          fontStyle: 'italic',
        }}>Mortensrud</h2>
        <h2 style={{
          fontFamily: theme.fontDisplay, fontSize: 44, fontWeight: 400,
          color: theme.textSecondary, letterSpacing: '-1.2px',
          lineHeight: 0.95, margin: '2px 0 0',
        }}>Herreklubb</h2>

        {/* Nøkkeltall, mono, som en redaksjonell byline */}
        <div style={{
          display: 'flex', gap: 22, marginTop: 22,
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}>
          <div>
            <div style={{ color: theme.accent, fontSize: 18, fontFamily: theme.fontDisplay, letterSpacing: '-0.3px', marginBottom: 2 }}>17</div>
            Medlemmer
          </div>
          <div>
            <div style={{ color: theme.accent, fontSize: 18, fontFamily: theme.fontDisplay, letterSpacing: '-0.3px', marginBottom: 2 }}>11</div>
            Årganger
          </div>
          <div>
            <div style={{ color: theme.accent, fontSize: 18, fontFamily: theme.fontDisplay, letterSpacing: '-0.3px', marginBottom: 2 }}>132</div>
            Sammenkomster
          </div>
        </div>
      </div>

      {/* Seksjons-label */}
      <div style={{
        fontFamily: theme.fontMono, fontSize: 10,
        color: theme.textTertiary, letterSpacing: '2px',
        textTransform: 'uppercase', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        Innhold
        <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
      </div>

      {/* Liste — magazine table-of-contents-stil */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <div key={r.title} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '18px 4px',
            borderBottom: `0.5px solid ${theme.borderSubtle}`,
            cursor: 'pointer',
          }}>
            <div style={{
              fontFamily: theme.fontMono, fontSize: 10,
              color: theme.textTertiary, letterSpacing: '1.6px',
              fontWeight: 600, width: 22, flexShrink: 0,
            }}>{r.nr}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: theme.fontDisplay, fontSize: 19, fontWeight: 500,
                color: theme.textPrimary, letterSpacing: '-0.3px',
                lineHeight: 1.1, marginBottom: 2,
              }}>{r.title}</div>
              <div style={{
                fontFamily: theme.fontBody, fontSize: 12,
                color: theme.textTertiary, letterSpacing: '0.1px',
              }}>{r.sub}</div>
            </div>
            {r.meta && (
              <span style={{
                fontFamily: theme.fontMono, fontSize: 11,
                color: theme.textSecondary, marginRight: 4,
                letterSpacing: '0.5px',
              }}>{r.meta}</span>
            )}
            <Icon name="chevron" size={14} color={theme.textTertiary} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────── KÅRINGER ────────────
function KaaringerSkjerm({ theme }) {
  const kategorier = [
    { navn: 'Årets Herremann', vinner: 'Lars Ove', sitat: 'Leverte kveld etter kveld.', profil: true },
    { navn: 'Årets arrangement', vinner: 'Isle of Islay-turen', sitat: 'Uforglemmelig. Dyp whisky, dypere samtaler.' },
    { navn: 'Årets kamerat', vinner: 'Ståle', sitat: 'Steppet inn da det trengtes.', profil: true },
    { navn: 'Kveldens mann', vinner: 'Bjørn', sitat: 'Tok rommet.', profil: true },
    { navn: 'Årets nykommer', vinner: null },
  ];
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase', marginBottom: 6,
        }}>Kåringer</div>
        <h1 style={{
          fontFamily: theme.fontDisplay, fontSize: 38, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.5px', margin: 0, lineHeight: 1,
        }}>Hall of Fame</h1>
      </div>

      {/* År-veksler */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', marginBottom: 18,
        background: theme.bgElevated,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
      }}>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textTertiary, padding: 4, display: 'flex',
        }}>
          <Icon name="chevron" size={16} color={theme.textTertiary} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: 20, fontWeight: 500,
          color: theme.accent, letterSpacing: '2px',
        }}>2025</div>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.textTertiary, padding: 4, display: 'flex',
        }}>
          <Icon name="chevron" size={16} color={theme.textTertiary} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {kategorier.map((k, i) => (
          <Card key={i} theme={theme} style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `1px solid ${theme.borderStrong}`,
                background: theme.accentSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {k.vinner ? (
                  <Icon name={k.profil ? 'crown' : 'trophy'} size={18} color={theme.accent} />
                ) : (
                  <Icon name="clock" size={18} color={theme.textTertiary} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: theme.fontMono, fontSize: 10,
                  color: theme.textTertiary, letterSpacing: '1.5px',
                  textTransform: 'uppercase', marginBottom: 4,
                }}>{k.navn}</div>
                {k.vinner ? (
                  <>
                    <div style={{
                      fontFamily: theme.fontDisplay, fontSize: 20, fontWeight: 500,
                      color: theme.textPrimary, lineHeight: 1.1, letterSpacing: '-0.2px',
                    }}>{k.vinner}</div>
                    <div style={{
                      fontFamily: theme.fontDisplay, fontSize: 13,
                      fontStyle: 'italic', color: theme.textSecondary,
                      marginTop: 6, lineHeight: 1.4,
                    }}>«{k.sitat}»</div>
                  </>
                ) : (
                  <div style={{
                    fontFamily: theme.fontBody, fontSize: 13,
                    color: theme.textTertiary, fontStyle: 'italic', marginTop: 4,
                  }}>Ikke kåret ennå</div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ──────────── PROFIL ────────────
function ProfilSkjerm({ theme }) {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase', marginBottom: 6,
        }}>Medlem siden 2015</div>
        <h1 style={{
          fontFamily: theme.fontDisplay, fontSize: 38, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.5px', margin: 0, lineHeight: 1,
        }}>Din profil</h1>
        </div>
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px',
          background: 'transparent',
          border: `1px solid ${theme.border}`,
          borderRadius: 999,
          color: theme.textPrimary,
          fontFamily: theme.fontBody, fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
        }}>
          Rediger
        </button>
      </div>

      {/* Profil-hero */}
      <Card theme={theme} style={{
        padding: 24, marginBottom: 20,
        textAlign: 'center',
        background: `radial-gradient(ellipse at top, ${theme.accentSoft}, transparent 70%), ${theme.bgElevated}`,
      }}>
        <div style={{ display: 'inline-block' }}>
          <Avatar name="Reidar Eiken" size={78} theme={theme} />
        </div>
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: 22, fontWeight: 500,
          color: theme.textPrimary, marginTop: 14, letterSpacing: '-0.3px',
        }}>Reidar Eiken</div>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.accent, letterSpacing: '2px',
          textTransform: 'uppercase', marginTop: 4,
        }}>Admin</div>

        {/* Stats */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 28,
          marginTop: 20, paddingTop: 20,
          borderTop: `0.5px solid ${theme.borderSubtle}`,
        }}>
          {[
            { val: '47', lbl: 'Oppmøter' },
            { val: '8', lbl: 'Kåringer' },
            { val: '11', lbl: 'År' },
          ].map(s => (
            <div key={s.lbl}>
              <div style={{
                fontFamily: theme.fontDisplay, fontSize: 24, fontWeight: 500,
                color: theme.accent,
              }}>{s.val}</div>
              <div style={{
                fontFamily: theme.fontMono, fontSize: 9,
                color: theme.textTertiary, letterSpacing: '1.5px',
                textTransform: 'uppercase', marginTop: 2,
              }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ansvar */}
      <div style={{
        fontFamily: theme.fontMono, fontSize: 10,
        color: theme.textTertiary, letterSpacing: '2px',
        textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        Arrangøransvar
        <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
        {[
          { periode: '2026 · Sommer', tittel: 'Sommerturen', meta: 'Hvaler · 12. juni', lagtInn: true },
          { periode: '2026 · Vår', tittel: 'Mai-juni-møtet', meta: 'Dato og sted ikke satt', lagtInn: false },
        ].map((a, i, arr) => (
          <div key={a.tittel} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 4px',
            borderBottom: i < arr.length - 1 ? `0.5px solid ${theme.borderSubtle}` : 'none',
          }}>
            {/* Status-prikk */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: a.lagtInn ? '#7cc99a' : '#d97a6c',
              flexShrink: 0,
              boxShadow: a.lagtInn
                ? '0 0 0 3px rgba(124, 201, 154, 0.12)'
                : '0 0 0 3px rgba(217, 122, 108, 0.12)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: theme.fontMono, fontSize: 10,
                color: theme.textTertiary, letterSpacing: '1.6px', fontWeight: 600,
                textTransform: 'uppercase', marginBottom: 4,
              }}>{a.periode}</div>
              <div style={{
                fontFamily: theme.fontDisplay, fontSize: 18, fontWeight: 500,
                color: theme.textPrimary, letterSpacing: '-0.2px',
                lineHeight: 1.15, marginBottom: 3,
              }}>{a.tittel}</div>
              <div style={{
                fontFamily: theme.fontBody, fontSize: 12,
                color: theme.textTertiary, letterSpacing: '0.1px',
              }}>
                {a.meta}
              </div>
            </div>
            <div style={{
              fontFamily: theme.fontMono, fontSize: 10,
              color: a.lagtInn ? '#7cc99a' : '#d97a6c',
              letterSpacing: '1.4px', fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              {a.lagtInn ? 'Lagt inn' : 'Ikke lagt inn'}
            </div>
          </div>
        ))}
      </div>

      {/* Varsler */}
      <div style={{
        fontFamily: theme.fontMono, fontSize: 10,
        color: theme.textTertiary, letterSpacing: '2px',
        textTransform: 'uppercase', marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        Varsler
        <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[
          { label: 'Push', sub: 'Nye arrangementer og svar', on: true },
          { label: 'E-post', sub: 'Oppsummering hver mandag', on: true },
          { label: 'Bursdager', sub: 'Dagen før', on: false },
        ].map((item, i, arr) => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 4px',
            borderBottom: i < arr.length - 1 ? `0.5px solid ${theme.borderSubtle}` : 'none',
            gap: 16,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: theme.fontDisplay, fontSize: 16, fontWeight: 500,
                color: theme.textPrimary, letterSpacing: '-0.2px',
                lineHeight: 1.2, marginBottom: 2,
              }}>
                {item.label}
              </div>
              <div style={{
                fontFamily: theme.fontBody, fontSize: 12,
                color: theme.textTertiary, letterSpacing: '0.1px',
              }}>
                {item.sub}
              </div>
            </div>
            <div style={{
              width: 40, height: 22, borderRadius: 999,
              background: item.on ? theme.accent : 'transparent',
              border: item.on ? 'none' : `1px solid ${theme.border}`,
              position: 'relative',
              transition: 'background 0.2s',
              cursor: 'pointer',
              flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute',
                top: item.on ? 2 : 1, left: item.on ? 20 : 1,
                width: item.on ? 18 : 18, height: item.on ? 18 : 18, borderRadius: '50%',
                background: item.on ? '#0a0a0a' : theme.textTertiary,
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { HjemSkjerm, KlubbinfoSkjerm, KaaringerSkjerm, ProfilSkjerm });

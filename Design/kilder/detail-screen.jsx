// RSVP-blokk — to tilstander: åpent valg før svar / kollapset bekreftelse etter svar
function RsvpBlokk({ theme, svar, setSvar, redigerer, setRedigerer }) {
  const valgt = svar && !redigerer;

  const alternativer = [
    { id: 'ja',      label: 'Jeg kommer', kort: 'Du er påmeldt',  ikon: 'check',    accent: theme.accent },
    { id: 'kanskje', label: 'Kanskje',    kort: 'Du er kanskje på', ikon: 'question', accent: theme.textSecondary },
    { id: 'nei',     label: 'Kan ikke',   kort: 'Du står over',     ikon: 'x',        accent: theme.textTertiary },
  ];

  if (valgt) {
    const v = alternativer.find(a => a.id === svar);
    const isJa = svar === 'ja';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px 12px 14px',
        borderRadius: 14,
        background: isJa ? theme.accentSoft : theme.bgElevated,
        border: `0.5px solid ${isJa ? theme.borderStrong : theme.border}`,
        marginBottom: 28,
      }}>
        {/* Statusbrikke */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: isJa ? theme.accent : 'transparent',
          border: isJa ? 'none' : `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <RsvpGlyph name={v.ikon} color={isJa ? '#0a0a0a' : v.accent} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 9,
            color: theme.textTertiary, letterSpacing: '1.8px',
            textTransform: 'uppercase', marginBottom: 3, fontWeight: 600,
          }}>Ditt svar</div>
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 500,
            color: theme.textPrimary, letterSpacing: '-0.2px',
            lineHeight: 1.1,
          }}>{v.kort}</div>
        </div>

        <button
          onClick={() => setRedigerer(true)}
          style={{
            padding: '8px 14px', borderRadius: 999,
            border: `0.5px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textSecondary,
            fontFamily: theme.fontBody, fontSize: 12, fontWeight: 500,
            letterSpacing: '0.1px', cursor: 'pointer',
            flexShrink: 0,
          }}>
          Endre
        </button>
      </div>
    );
  }

  // Åpent valg — tre finere knapper med ikon + label
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <span style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase',
        }}>Kommer du?</span>
        <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
        {svar && redigerer && (
          <button
            onClick={() => setRedigerer(false)}
            style={{
              background: 'transparent', border: 'none',
              color: theme.textTertiary,
              fontFamily: theme.fontMono, fontSize: 9,
              letterSpacing: '1.8px', textTransform: 'uppercase',
              cursor: 'pointer', padding: 0, fontWeight: 600,
            }}>Avbryt</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {alternativer.map(a => {
          const erAktiv = svar === a.id;
          const erJa = a.id === 'ja';
          return (
            <button
              key={a.id}
              onClick={() => { setSvar(a.id); setRedigerer(false); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 6, padding: '14px 6px', borderRadius: 14,
                background: erAktiv ? (erJa ? theme.accent : theme.bgElevated) : 'transparent',
                border: erAktiv
                  ? (erJa ? 'none' : `0.5px solid ${theme.borderStrong}`)
                  : `1px solid ${theme.border}`,
                color: erAktiv && erJa ? '#0a0a0a' : theme.textPrimary,
                fontFamily: theme.fontBody, cursor: 'pointer',
                transition: 'background 0.15s, border 0.15s',
              }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: erAktiv && erJa ? 'rgba(10,10,12,0.12)' : 'transparent',
                border: erAktiv && erJa ? 'none' : `0.5px solid ${theme.border}`,
              }}>
                <RsvpGlyph name={a.ikon} color={erAktiv && erJa ? '#0a0a0a' : a.accent} />
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600, letterSpacing: '0.1px',
              }}>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RsvpGlyph({ name, color }) {
  const paths = {
    check:    <path d="M5 12l5 5 9-11" />,
    question: <><path d="M9 9a3 3 0 116 0c0 2-3 2-3 4M12 18h.01" /></>,
    x:        <path d="M6 6l12 12M18 6L6 18" />,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// Arrangement-detaljskjerm — vises når man trykker på et arrangement fra agenda
function ArrangementDetaljSkjerm({ theme }) {
  const [svar, setSvar] = React.useState('ja'); // null | 'ja' | 'kanskje' | 'nei'
  const [redigerer, setRedigerer] = React.useState(false);
  const arr = {
    tittel: 'Sommertur til Hvaler',
    type: 'tur',
    mnd: 'JUN', dag: '12', tid: '14:00',
    datoLang: '12. juni 2026',
    sted: 'Oslo Havn, kai 3',
    destinasjon: 'Hvaler · Skjærhalden',
    pris: '4 200',
    beskrivelse: 'Årets sommertur går til Hvaler. Vi møtes på kai 3 og tar båten ut. Båthavna i Skjærhalden er basen — overnatting på hotellet like ved. Skjermaljpa er tilrettelagt med lokal guide søndag formiddag.',
    deltakere: ['Reidar', 'Lars Ove', 'Ståle', 'Bjørn', 'Øyvind', 'Geir', 'Knut', 'Tom', 'Petter', 'Erlend', 'Mads'],
  };

  const meldinger = [
    { navn: 'Lars Ove', tid: '14:02', tekst: 'Noen som har sjekket værmeldingen? Så det kom en front på fredag.' },
    { navn: 'Bjørn', tid: '14:08', tekst: 'Det skal klarne til lørdag. Vi er i rute.' },
    { navn: 'Reidar', tid: '14:41', tekst: 'Husk pass om noen vurderer Strømstad på søndagen — jeg har fått innpass hos Sjöstugan.', meg: true },
    { navn: 'Ståle', tid: '15:10', tekst: 'Jeg tar med whiskyen til kveldene. Lagavulin og en Springbank.' },
  ];

  return (
    <div style={{ padding: '0 0 140px' }}>
      {/* Hero-bilde */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Placeholder theme={theme} label="" aspectRatio="4/3" type={arr.type} />
        {/* Gradient mørk nederst for å bære datoen */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, transparent 40%, ${theme.bg} 100%)`,
          pointerEvents: 'none',
        }} />
        <button style={{
          position: 'absolute', top: 14, left: 16,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(10,10,12,0.6)',
          backdropFilter: 'blur(16px)',
          border: `0.5px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Icon name="chevron" size={16} color={theme.textPrimary} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button style={{
          position: 'absolute', top: 14, right: 16,
          padding: '8px 14px', borderRadius: 999,
          background: 'rgba(10,10,12,0.6)', backdropFilter: 'blur(16px)',
          border: `0.5px solid ${theme.border}`,
          color: theme.textPrimary,
          fontFamily: theme.fontBody, fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
        }}>Rediger</button>
        {/* Dato-chip nederst på bildet */}
        <div style={{
          position: 'absolute', bottom: 16, left: 20,
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.accent, letterSpacing: '1.8px', fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {arr.mnd} {arr.dag} · {arr.tid}
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Tittel-blokk */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{
            fontFamily: theme.fontDisplay, fontSize: 32, fontWeight: 500,
            color: theme.textPrimary, letterSpacing: '-0.5px',
            margin: '0 0 6px', lineHeight: 1.05,
          }}>{arr.tittel}</h1>
          <div style={{
            fontFamily: theme.fontBody, fontSize: 13,
            color: theme.textTertiary, letterSpacing: '0.1px',
          }}>
            {arr.datoLang} · {arr.destinasjon}
          </div>
        </div>

        {/* Ditt svar — to tilstander: åpent valg eller kollapset bekreftelse */}
        <RsvpBlokk theme={theme} svar={svar} setSvar={setSvar} redigerer={redigerer} setRedigerer={setRedigerer} />

        {/* Fakta — som redigering-skjemaet, mono-labels over verdier */}
        <div style={{
          marginBottom: 26,
          borderTop: `0.5px solid ${theme.borderSubtle}`,
          borderBottom: `0.5px solid ${theme.borderSubtle}`,
        }}>
          {[
            { label: 'Oppmøte', value: arr.sted, icon: 'mapPin' },
            { label: 'Destinasjon', value: arr.destinasjon, icon: 'plane' },
            { label: 'Pris', value: `${arr.pris} kr`, sub: 'per person', icon: 'wine' },
          ].map((f, i, a) => (
            <div key={f.label} style={{
              padding: '14px 0',
              display: 'flex', alignItems: 'center', gap: 14,
              borderBottom: i < a.length - 1 ? `0.5px solid ${theme.borderSubtle}` : 'none',
            }}>
              <Icon name={f.icon} size={14} color={theme.textTertiary} strokeWidth={1.5} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: theme.fontMono, fontSize: 9.5,
                  color: theme.textTertiary, letterSpacing: '1.6px',
                  textTransform: 'uppercase', marginBottom: 2, fontWeight: 600,
                }}>{f.label}</div>
                <div style={{
                  fontFamily: theme.fontBody, fontSize: 14, color: theme.textPrimary,
                }}>
                  {f.value}
                  {f.sub && <span style={{ color: theme.textTertiary, marginLeft: 6 }}>· {f.sub}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Beskrivelse */}
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          Beskrivelse
          <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
        </div>
        <p style={{
          margin: '0 0 28px',
          fontFamily: theme.fontBody, fontSize: 14, lineHeight: 1.65,
          color: theme.textSecondary, letterSpacing: '0.1px',
        }}>
          {arr.beskrivelse}
        </p>

        {/* Påmeldt */}
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>Påmeldt</span>
          <span style={{ color: theme.textSecondary }}>{arr.deltakere.length}</span>
          <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
          {arr.deltakere.slice(0, 7).map((n, i) => (
            <div key={n} style={{
              marginLeft: i === 0 ? 0 : -8, zIndex: 20 - i,
              border: `2px solid ${theme.bg}`, borderRadius: '50%',
            }}>
              <Avatar name={n} size={32} theme={theme} />
            </div>
          ))}
          <span style={{
            marginLeft: 12, fontFamily: theme.fontBody, fontSize: 13,
            color: theme.textSecondary,
          }}>
            + {arr.deltakere.length - 7} til
          </span>
        </div>

        {/* Samtale */}
        <div style={{
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '2px',
          textTransform: 'uppercase', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>Samtale</span>
          <span style={{ color: theme.textSecondary }}>{meldinger.length}</span>
          <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {meldinger.map((m, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10,
              flexDirection: m.meg ? 'row-reverse' : 'row',
            }}>
              <div style={{ flexShrink: 0, alignSelf: 'flex-end' }}>
                <Avatar name={m.navn} size={26} theme={theme} />
              </div>
              <div style={{
                maxWidth: '78%',
                display: 'flex', flexDirection: 'column',
                alignItems: m.meg ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  marginBottom: 4, paddingLeft: m.meg ? 0 : 2, paddingRight: m.meg ? 2 : 0,
                }}>
                  <span style={{
                    fontFamily: theme.fontBody, fontSize: 12,
                    color: theme.textSecondary, fontWeight: 500,
                  }}>{m.navn}</span>
                  <span style={{
                    fontFamily: theme.fontMono, fontSize: 9,
                    color: theme.textTertiary, letterSpacing: '1.2px',
                  }}>{m.tid}</span>
                </div>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: m.meg ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.meg ? theme.accentSoft : theme.bgElevated,
                  border: `0.5px solid ${m.meg ? theme.borderStrong : theme.borderSubtle}`,
                  fontFamily: theme.fontBody, fontSize: 13, lineHeight: 1.5,
                  color: theme.textPrimary, letterSpacing: '0.1px',
                }}>
                  {m.tekst}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Skriv melding */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 8px 8px 16px',
          border: `0.5px solid ${theme.border}`,
          borderRadius: 999,
          background: theme.bgElevated,
          marginBottom: 26,
        }}>
          <div style={{
            flex: 1,
            fontFamily: theme.fontBody, fontSize: 13,
            color: theme.textTertiary,
          }}>
            Skriv en melding…
          </div>
          <button style={{
            width: 32, height: 32, borderRadius: '50%',
            background: theme.accent, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <Icon name="arrowRight" size={14} color="#0a0a0a" strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </div>
  );
}

Object.assign(window, { ArrangementDetaljSkjerm });

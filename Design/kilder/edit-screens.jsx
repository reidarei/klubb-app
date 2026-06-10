// Redigeringsskjemaer — arrangement og profil

// Seksjons-label med linje — samme vokabular som Klubbinfo/Profil
function SkjemaSeksjon({ theme, label, children, style }) {
  return (
    <div style={{ marginBottom: 20, ...style }}>
      <div style={{
        fontFamily: theme.fontMono, fontSize: 10,
        color: theme.textTertiary, letterSpacing: '2px',
        textTransform: 'uppercase', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {label}
        <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
      </div>
      {children}
    </div>
  );
}

// Felles felt-stil — mono-label over verdi, linje under
function Field({ theme, label, children, last = false, accent = false }) {
  return (
    <div style={{
      padding: '10px 4px',
      borderBottom: last ? 'none' : `0.5px solid ${theme.borderSubtle}`,
    }}>
      <div style={{
        fontFamily: theme.fontMono, fontSize: 9.5,
        color: theme.textTertiary, letterSpacing: '1.6px',
        textTransform: 'uppercase', marginBottom: 4, fontWeight: 600,
      }}>{label}</div>
      <div style={{
        fontFamily: accent ? theme.fontDisplay : theme.fontBody,
        fontSize: accent ? 19 : 14,
        fontWeight: accent ? 500 : 400,
        color: theme.textPrimary,
        letterSpacing: accent ? '-0.3px' : '0',
      }}>
        {children}
      </div>
    </div>
  );
}

// Segmented toggle (tur/møte)
function Segment({ theme, options, value }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderTop: `0.5px solid ${theme.borderSubtle}`,
      borderBottom: `0.5px solid ${theme.borderSubtle}`,
    }}>
      {options.map((o, i) => {
        const active = value === o.id;
        return (
          <div key={o.id} style={{
            flex: 1, padding: '10px 0',
            borderLeft: i > 0 ? `0.5px solid ${theme.borderSubtle}` : 'none',
            textAlign: 'center',
            fontFamily: theme.fontDisplay,
            fontSize: 14, fontWeight: 500,
            letterSpacing: '-0.1px',
            color: active ? theme.textPrimary : theme.textTertiary,
            position: 'relative',
            cursor: 'pointer',
          }}>
            {o.label}
            {active && (
              <span style={{
                position: 'absolute', bottom: -1, left: '50%',
                transform: 'translateX(-50%)',
                width: 24, height: 1.5, background: theme.accent,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mini-toggle — minimalistisk som i Varsler-listen på profilen
function MiniToggle({ theme, on }) {
  return (
    <div style={{
      width: 40, height: 22, borderRadius: 999,
      background: on ? theme.accent : 'transparent',
      border: on ? 'none' : `1px solid ${theme.border}`,
      position: 'relative',
      cursor: 'pointer',
      flexShrink: 0,
      transition: 'background 0.2s',
    }}>
      <div style={{
        position: 'absolute',
        top: on ? 2 : 1, left: on ? 20 : 1,
        width: 18, height: 18, borderRadius: '50%',
        background: on ? '#0a0a0a' : theme.textTertiary,
        transition: 'left 0.2s',
      }} />
    </div>
  );
}

// Toolbar øverst — minimal, ingen bakgrunn
function SkjemaBar({ theme, overtittel, tittel, primary = 'Lagre' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '2px 0 14px', marginBottom: 8,
    }}>
      <button style={{
        background: 'none', border: 'none', color: theme.textSecondary,
        fontFamily: theme.fontBody, fontSize: 14, cursor: 'pointer', padding: 0,
      }}>Avbryt</button>
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        {overtittel && (
          <div style={{
            fontFamily: theme.fontMono, fontSize: 9,
            color: theme.textTertiary, letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: 2,
          }}>{overtittel}</div>
        )}
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: 16, fontWeight: 500,
          color: theme.textPrimary, letterSpacing: '-0.2px',
        }}>{tittel}</div>
      </div>
      <button style={{
        background: theme.accent,
        color: '#0a0a0a',
        border: 'none',
        padding: '7px 14px',
        borderRadius: 999,
        fontFamily: theme.fontBody, fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
      }}>{primary}</button>
    </div>
  );
}

// ────────── ARRANGEMENT-REDIGERING ──────────
function RedigerArrangementSkjerm({ theme }) {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar theme={theme} overtittel="Rediger" tittel="Sommerturen" />

      {/* Hero-bilde med bytt-knapp */}
      <div style={{ position: 'relative', marginBottom: 20, borderRadius: theme.radius, overflow: 'hidden' }}>
        <Placeholder theme={theme} label="ARRANGEMENT BILDE" aspectRatio="16/9" type="tur" />
        <button style={{
          position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(10,10,12,0.6)',
          backdropFilter: 'blur(12px)',
          color: theme.textPrimary,
          border: `0.5px solid ${theme.border}`,
          padding: '7px 14px',
          borderRadius: 999,
          fontSize: 12, fontWeight: 500,
          fontFamily: theme.fontBody,
          cursor: 'pointer',
        }}>Bytt bilde</button>
      </div>

      {/* Type */}
      <SkjemaSeksjon theme={theme} label="Type">
        <Segment theme={theme} value="tur" options={[
          { id: 'tur', label: 'Tur' },
          { id: 'møte', label: 'Møte' },
          { id: 'annet', label: 'Annet' },
        ]} />
      </SkjemaSeksjon>

      {/* Detaljer */}
      <SkjemaSeksjon theme={theme} label="Detaljer">
        <Field theme={theme} label="Tittel" accent>Sommertur til Hvaler</Field>
        <Field theme={theme} label="Start">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>12. juni 2026 · 14:00</span>
            <Icon name="calendar" size={15} color={theme.textTertiary} />
          </div>
        </Field>
        <Field theme={theme} label="Slutt">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>14. juni 2026 · 18:00</span>
            <Icon name="calendar" size={15} color={theme.textTertiary} />
          </div>
        </Field>
        <Field theme={theme} label="Oppmøtested">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Oslo Havn, kai 3</span>
            <Icon name="mapPin" size={15} color={theme.textTertiary} />
          </div>
        </Field>
        <Field theme={theme} label="Destinasjon" last>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Hvaler · Skjærhalden</span>
            <MiniToggle theme={theme} on={true} />
          </div>
        </Field>
      </SkjemaSeksjon>

      {/* Kostnad */}
      <SkjemaSeksjon theme={theme} label="Kostnad">
        <Field theme={theme} label="Pris per person" last accent>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span>4 200</span>
              <span style={{
                fontFamily: theme.fontMono, fontSize: 10,
                color: theme.textTertiary, letterSpacing: '1.4px',
                textTransform: 'uppercase',
              }}>kr</span>
            </div>
            <MiniToggle theme={theme} on={true} />
          </div>
        </Field>
      </SkjemaSeksjon>

      {/* Beskrivelse */}
      <SkjemaSeksjon theme={theme} label="Beskrivelse">
        <div style={{
          padding: '4px 0',
          fontFamily: theme.fontBody, fontSize: 14, lineHeight: 1.6,
          color: theme.textSecondary, minHeight: 88,
        }}>
          Årets sommertur går til Hvaler. Vi møtes på kai 3 og tar båten ut. Båthavna i Skjærhalden er basen — overnatting på hotellet like ved.
        </div>
        <div style={{
          marginTop: 12, paddingTop: 14,
          borderTop: `0.5px solid ${theme.borderSubtle}`,
          display: 'flex', gap: 16,
          fontFamily: theme.fontMono, fontSize: 10,
          color: theme.textTertiary, letterSpacing: '1.4px', textTransform: 'uppercase',
        }}>
          <span>**bold**</span>
          <span>*italic*</span>
          <span>— liste</span>
        </div>
      </SkjemaSeksjon>

      {/* Faresone */}
      <SkjemaSeksjon theme={theme} label="Faresone" style={{ marginBottom: 0 }}>
        <div style={{
          padding: '16px 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#d97a6c',
          fontFamily: theme.fontDisplay, fontSize: 16, fontWeight: 500,
          letterSpacing: '-0.2px',
          cursor: 'pointer',
          borderBottom: `0.5px solid ${theme.borderSubtle}`,
        }}>
          <span>Slett arrangement</span>
          <Icon name="chevron" size={14} color="#d97a6c" />
        </div>
      </SkjemaSeksjon>
    </div>
  );
}

// ────────── PROFIL-REDIGERING ──────────
function RedigerProfilSkjerm({ theme }) {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar theme={theme} overtittel="Rediger" tittel="Profil" />

      {/* Avatar-editor — mer diskret enn før */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 4px 18px',
        borderTop: `0.5px solid ${theme.borderSubtle}`,
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
        marginBottom: 20,
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name="Reidar Eiken" size={56} theme={theme} />
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 22, height: 22, borderRadius: '50%',
            background: theme.accent,
            color: '#0a0a0a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${theme.bg}`,
          }}>
            <Icon name="plus" size={11} color="#0a0a0a" strokeWidth={2.5} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 500,
            color: theme.textPrimary, letterSpacing: '-0.3px', marginBottom: 2,
          }}>Reidar Eiken</div>
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: theme.accent, fontFamily: theme.fontBody,
            fontSize: 12, fontWeight: 500,
          }}>Bytt profilbilde</button>
        </div>
      </div>

      {/* Personalia */}
      <SkjemaSeksjon theme={theme} label="Personalia">
        <Field theme={theme} label="Navn" accent>Reidar Eiken</Field>
        <Field theme={theme} label="Visningsnavn">Reidar</Field>
        <Field theme={theme} label="Fødselsdato" last>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>3. mars 1982</span>
            <Icon name="calendar" size={15} color={theme.textTertiary} />
          </div>
        </Field>
      </SkjemaSeksjon>

      {/* Kontakt */}
      <SkjemaSeksjon theme={theme} label="Kontakt">
        <Field theme={theme} label="E-post">reidar@example.no</Field>
        <Field theme={theme} label="Telefon" last>+47 918 23 456</Field>
      </SkjemaSeksjon>

      {/* Sikkerhet */}
      <SkjemaSeksjon theme={theme} label="Sikkerhet">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 4px',
          cursor: 'pointer',
          gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: theme.fontDisplay, fontSize: 16, fontWeight: 500,
              color: theme.textPrimary, letterSpacing: '-0.2px', marginBottom: 2,
            }}>Endre passord</div>
            <div style={{
              fontFamily: theme.fontBody, fontSize: 12,
              color: theme.textTertiary, letterSpacing: '0.1px',
            }}>Sist endret for 4 måneder siden</div>
          </div>
          <Icon name="chevron" size={14} color={theme.textTertiary} />
        </div>
      </SkjemaSeksjon>

      {/* Logg ut */}
      <div style={{ marginTop: 28 }}>
        <button style={{
          width: '100%',
          padding: '14px 0',
          background: 'transparent',
          border: `1px solid ${theme.border}`,
          borderRadius: 999,
          color: '#d97a6c',
          fontFamily: theme.fontBody, fontSize: 14, fontWeight: 500,
          letterSpacing: '0.2px',
          cursor: 'pointer',
        }}>
          Logg ut
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { RedigerArrangementSkjerm, RedigerProfilSkjerm });

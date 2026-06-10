// Medlemmer — liste over klubbens 17 aktive medlemmer, i samme typografiske stil som Klubbinfo
function MedlemmerSkjerm({ theme }) {
  const medlemmer = [
    { navn: 'Reidar Einarsen',   rolle: 'Stifter',           medlem: 2015, ar: 11, narv: 94, status: 'aktiv', bursdag: '04.03' },
    { navn: 'Lars Ove Dahl',     rolle: 'Stifter',           medlem: 2015, ar: 11, narv: 88, status: 'aktiv', bursdag: '19.06' },
    { navn: 'Ståle Berg',        rolle: 'Medlem',            medlem: 2016, ar: 10, narv: 91, status: 'aktiv', bursdag: '02.11' },
    { navn: 'Bjørn Haugen',      rolle: 'Medlem',            medlem: 2016, ar: 10, narv: 82, status: 'aktiv', bursdag: '27.01' },
    { navn: 'Øyvind Solberg',    rolle: 'Medlem',            medlem: 2017, ar:  9, narv: 76, status: 'aktiv', bursdag: '11.09' },
    { navn: 'Geir Aaltvedt',     rolle: 'Medlem',            medlem: 2017, ar:  9, narv: 71, status: 'aktiv', bursdag: '22.07' },
    { navn: 'Knut Mikalsen',     rolle: 'Medlem',            medlem: 2018, ar:  8, narv: 85, status: 'aktiv', bursdag: '05.04' },
    { navn: 'Tom Engebretsen',   rolle: 'Medlem',            medlem: 2019, ar:  7, narv: 68, status: 'aktiv', bursdag: '18.12' },
    { navn: 'Petter Vik',        rolle: 'Medlem',            medlem: 2020, ar:  6, narv: 64, status: 'aktiv', bursdag: '09.05' },
    { navn: 'Erlend Moen',       rolle: 'Medlem',            medlem: 2021, ar:  5, narv: 59, status: 'aktiv', bursdag: '30.08' },
    { navn: 'Mads Fagerli',      rolle: 'Medlem',            medlem: 2022, ar:  4, narv: 52, status: 'aktiv', bursdag: '14.02' },
    { navn: 'Henrik Strand',     rolle: 'Nytt medlem',       medlem: 2025, ar:  1, narv: 41, status: 'ny',    bursdag: '07.10' },
  ];
  const aeres = [
    { navn: 'Per Kristoffersen', rolle: 'Æresmedlem',        medlem: 2015, ar: 11, narv: 100 },
    { navn: 'Arne Bøe',          rolle: 'Æresmedlem',        medlem: 2015, ar: 11, narv: 96 },
    { navn: 'Svein Nilsen',      rolle: 'Æresmedlem',        medlem: 2016, ar: 10, narv: 98 },
  ];

  return (
    <div style={{ padding: '0 20px 140px' }}>
      {/* Header — typografisk som resten */}
      <div style={{
        padding: '12px 4px 28px',
        marginBottom: 28,
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
      }}>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 9,
          color: theme.textTertiary, letterSpacing: '2.5px',
          textTransform: 'uppercase', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 18, height: '0.5px', background: theme.borderStrong }} />
          Klubbinfo / Medlemmer
        </div>
        <h2 style={{
          fontFamily: theme.fontDisplay, fontSize: 40, fontWeight: 400,
          color: theme.textPrimary, letterSpacing: '-1px',
          lineHeight: 0.98, margin: 0,
        }}>Herrene</h2>
        <div style={{
          marginTop: 10,
          fontFamily: theme.fontBody, fontSize: 13,
          color: theme.textTertiary, letterSpacing: '0.1px',
        }}>
          15 aktive · 3 æresmedlemmer · 132 sammenkomster
        </div>

        {/* Søk + filter */}
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            border: `0.5px solid ${theme.border}`,
            borderRadius: 999,
            background: theme.bgElevated,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme.textTertiary} strokeWidth="1.5">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <span style={{
              fontFamily: theme.fontBody, fontSize: 13, color: theme.textTertiary,
            }}>Søk etter medlem…</span>
          </div>
          <button style={{
            padding: '0 14px', borderRadius: 999,
            border: `0.5px solid ${theme.border}`,
            background: theme.bgElevated,
            color: theme.textSecondary,
            fontFamily: theme.fontMono, fontSize: 10,
            letterSpacing: '1.5px', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>A–Å</button>
        </div>
      </div>

      {/* Aktive medlemmer */}
      <SeksjonLabel theme={theme} label="Aktive" tall={medlemmer.length} />
      <div style={{ marginBottom: 34 }}>
        {medlemmer.map((m, i, arr) => (
          <MedlemRad key={m.navn} m={m} theme={theme} last={i === arr.length - 1} />
        ))}
      </div>

      {/* Æresmedlemmer */}
      <SeksjonLabel theme={theme} label="Æresmedlemmer" tall="3" />
      <div>
        {aeres.map((m, i, arr) => (
          <MedlemRad key={m.navn} m={{ ...m, status: 'aeres' }} theme={theme} last={i === arr.length - 1} />
        ))}
      </div>

      {/* Inviter — fullbredde pill nederst */}
      <button style={{
        marginTop: 32,
        width: '100%', padding: '16px 0', borderRadius: 999,
        background: theme.accent, color: '#0a0a0a',
        border: 'none',
        fontFamily: theme.fontBody, fontSize: 14, fontWeight: 600,
        letterSpacing: '0.2px', cursor: 'pointer',
      }}>Inviter nytt medlem</button>
    </div>
  );
}

function SeksjonLabel({ theme, label, tall }) {
  return (
    <div style={{
      fontFamily: theme.fontMono, fontSize: 10,
      color: theme.textTertiary, letterSpacing: '2px',
      textTransform: 'uppercase', marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span>{label}</span>
      {tall !== undefined && <span style={{ color: theme.textSecondary }}>{tall}</span>}
      <span style={{ flex: 1, height: '0.5px', background: theme.borderSubtle }} />
    </div>
  );
}

function MedlemRad({ m, theme, last }) {
  const narvColor = m.narv >= 85 ? theme.accent : m.narv >= 70 ? theme.textSecondary : theme.textTertiary;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 4px',
      borderBottom: last ? 'none' : `0.5px solid ${theme.borderSubtle}`,
      cursor: 'pointer',
    }}>
      <Avatar name={m.navn} size={40} theme={theme} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2,
        }}>
          <span style={{
            fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 500,
            color: theme.textPrimary, letterSpacing: '-0.2px',
            lineHeight: 1.1,
          }}>{m.navn}</span>
          {m.status === 'ny' && (
            <span style={{
              fontFamily: theme.fontMono, fontSize: 8,
              color: theme.accent, letterSpacing: '1.5px',
              textTransform: 'uppercase', fontWeight: 600,
              padding: '2px 6px',
              border: `0.5px solid ${theme.borderStrong}`,
              borderRadius: 4,
            }}>Ny</span>
          )}
          {m.status === 'aeres' && (
            <Icon name="crown" size={11} color={theme.accent} strokeWidth={1.5} />
          )}
        </div>
        <div style={{
          fontFamily: theme.fontBody, fontSize: 12,
          color: theme.textTertiary, letterSpacing: '0.1px',
        }}>
          {m.rolle} · medlem siden {m.medlem}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 13,
          color: narvColor, letterSpacing: '0.3px', fontWeight: 500,
        }}>{m.narv}%</div>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 8,
          color: theme.textTertiary, letterSpacing: '1.3px',
          textTransform: 'uppercase', marginTop: 1,
        }}>Nærvær</div>
      </div>
    </div>
  );
}

// ──────────── INNSTILLINGER ────────────
function InnstillingerSkjerm({ theme }) {
  // For medlemmer — slik det ligger i appen i dag (varsel_preferanser på profil-siden)
  const medlemToggles = [
    { title: 'Push-varsler', sub: 'Varsler på enheten',        on: true },
    { title: 'E-post',       sub: 'Varsler på e-post',         on: true },
  ];

  // For admin — slik det ligger i appen i dag (innstillinger/page.tsx)
  const pushEnheter = 14;

  const adminVarsler = [
    { title: 'Varsel ved nytt arrangement',   on: true  },
    { title: 'Påminnelse 7 dager før',         on: true  },
    { title: 'Påminnelse 1 dag før',            on: true  },
    { title: 'Purring til de som ikke har svart (3 dager før)', on: true },
    { title: 'Purring til arrangøransvarlige som ikke har opprettet arrangement', on: false },
    { title: 'Testmodus — varsler sendes kun til Reidar', on: false },
  ];

  const adminLenker = [
    { title: 'Faste arrangementer', sub: 'Arrangementmaler' },
    { title: 'Kåringer',            sub: 'Kåringmaler' },
    { title: 'Ønsker fra brukerne',  sub: 'Issues fra GitHub' },
    { title: 'Varselhistorikk',     sub: 'Siste 10 varsler sendt' },
  ];

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <div style={{
        padding: '8px 4px 20px',
        marginBottom: 20,
        borderBottom: `0.5px solid ${theme.borderSubtle}`,
      }}>
        <div style={{
          fontFamily: theme.fontMono, fontSize: 9,
          color: theme.textTertiary, letterSpacing: '2.5px',
          textTransform: 'uppercase', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 18, height: '0.5px', background: theme.borderStrong }} />
          Klubbinfo / Innstillinger
        </div>
        <h2 style={{
          fontFamily: theme.fontDisplay, fontSize: 34, fontWeight: 400,
          color: theme.textPrimary, letterSpacing: '-0.8px',
          lineHeight: 0.98, margin: 0,
        }}>Innstillinger</h2>
      </div>

      {/* MEDLEM — varsler */}
      <div style={{ marginBottom: 24 }}>
        <SeksjonLabel theme={theme} label="Varsler" />
        <div>
          {medlemToggles.map((t, i) => (
            <ToggleRad key={t.title} theme={theme} t={t} last={i === medlemToggles.length - 1} />
          ))}
        </div>
      </div>

      {/* ADMIN-skille */}
      <div style={{
        marginTop: 16, marginBottom: 18,
        padding: '12px 14px',
        borderRadius: 12,
        border: `0.5px solid ${theme.borderStrong}`,
        background: theme.accentSoft,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: theme.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: theme.fontMono, fontSize: 9,
            color: theme.textTertiary, letterSpacing: '2px',
            textTransform: 'uppercase', fontWeight: 600, marginBottom: 1,
          }}>Kun for admin</div>
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 17, fontWeight: 500,
            color: theme.textPrimary, letterSpacing: '-0.2px', lineHeight: 1,
          }}>Administrasjon</div>
        </div>
      </div>

      {/* Admin — Push-status */}
      <div style={{ marginBottom: 20 }}>
        <SeksjonLabel theme={theme} label="Push-varsler" />
        <div style={{
          padding: '12px 4px',
          fontFamily: theme.fontBody, fontSize: 13,
          color: theme.textPrimary,
        }}>
          <span style={{
            fontFamily: theme.fontMono, fontSize: 18,
            color: theme.accent, marginRight: 6,
          }}>{pushEnheter}</span>
          <span style={{ color: theme.textSecondary }}>enheter registrert</span>
        </div>
      </div>

      {/* Admin — Varsler (togglere) */}
      <div style={{ marginBottom: 20 }}>
        <SeksjonLabel theme={theme} label="Varsler" />
        <div>
          {adminVarsler.map((t, i) => (
            <ToggleRad key={t.title} theme={theme} t={t} last={i === adminVarsler.length - 1} />
          ))}
        </div>
      </div>

      {/* Admin — Lenker (maler, issues, logg) */}
      <div style={{ marginBottom: 20 }}>
        <SeksjonLabel theme={theme} label="Innhold" />
        <div>
          {adminLenker.map((it, i) => (
            <div key={it.title} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 4px',
              borderBottom: i < adminLenker.length - 1 ? `0.5px solid ${theme.borderSubtle}` : 'none',
              cursor: 'pointer',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: theme.fontBody, fontSize: 13, fontWeight: 500,
                  color: theme.textPrimary, marginBottom: 1,
                }}>{it.title}</div>
                <div style={{
                  fontFamily: theme.fontBody, fontSize: 11,
                  color: theme.textTertiary,
                }}>{it.sub}</div>
              </div>
              <Icon name="chevron" size={13} color={theme.textTertiary} />
            </div>
          ))}
        </div>
      </div>

      {/* App-info + logg ut */}
      <div style={{
        textAlign: 'center',
        fontFamily: theme.fontMono, fontSize: 9,
        color: theme.textTertiary, letterSpacing: '1.8px',
        textTransform: 'uppercase', marginTop: 16, marginBottom: 14,
      }}>
        Herreklubben · v2.4.1
      </div>

      <button style={{
        width: '100%', padding: '12px 0', borderRadius: 999,
        background: 'transparent',
        border: `1px solid ${theme.border}`,
        color: '#e87060',
        fontFamily: theme.fontBody, fontSize: 13, fontWeight: 600,
        letterSpacing: '0.2px', cursor: 'pointer',
      }}>Logg ut</button>
    </div>
  );
}

function ToggleRad({ theme, t, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 4px',
      borderBottom: last ? 'none' : `0.5px solid ${theme.borderSubtle}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: theme.fontBody, fontSize: 13, fontWeight: 500,
          color: theme.textPrimary, marginBottom: t.sub ? 1 : 0,
        }}>{t.title}</div>
        {t.sub && (
          <div style={{
            fontFamily: theme.fontBody, fontSize: 11,
            color: theme.textTertiary,
          }}>{t.sub}</div>
        )}
      </div>
      <div style={{
        width: 38, height: 22, borderRadius: 999,
        background: t.on ? theme.accent : theme.bgElevated,
        border: `0.5px solid ${t.on ? 'transparent' : theme.border}`,
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 2, left: t.on ? 18 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: t.on ? '#0a0a0a' : theme.textSecondary,
        }} />
      </div>
    </div>
  );
}

// Ikoner som kun brukes i innstillinger — ikke verdt å legge i hoved-Icon
function SettingsIcon({ name, color }) {
  const paths = {
    user:   <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>,
    lock:   <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>,
    mail:   <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></>,
    moon:   <path d="M20 14A8 8 0 019 4a8 8 0 1011 10z"/>,
    sparkle:<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>,
    users:  <><circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0116 0M17 4a4 4 0 010 8M23 21a8 8 0 00-6-7"/></>,
    doc:    <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/></>,
    help:   <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></>,
    message:<path d="M21 12a8 8 0 01-11 7l-6 2 2-5a8 8 0 1115-4z"/>,
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || paths.user}
    </svg>
  );
}

Object.assign(window, { MedlemmerSkjerm, InnstillingerSkjerm });

// Felles ikon-komponenter og UI-byggesteiner.

// Tynne stroke-baserte ikoner (Heroicons-stil, 24x24)
function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.5 }) {
  const paths = {
    calendar: <><path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8v0M11 12h1v5h1"/></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></>,
    plane: <><path d="M12 19l9-7-9-7v4L3 12l9 3v4z"/></>,
    chevron: <path d="M9 6l6 6-6 6"/>,
    chevronDown: <path d="M6 9l6 6 6-6"/>,
    bell: <><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0"/></>,
    message: <><path d="M21 12a8 8 0 01-11 7l-6 2 2-5a8 8 0 1115-4z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    users: <><circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0116 0M17 4a4 4 0 010 8M23 21a8 8 0 00-6-7"/></>,
    doc: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    building: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></>,
    chart: <><path d="M3 3v18h18M7 14l4-4 4 4 5-5"/></>,
    cog: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.38.25.78.33 1.17"/></>,
    arrowRight: <path d="M5 12h14M13 5l7 7-7 7"/>,
    sparkle: <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>,
    checkmark: <path d="M5 13l4 4L19 7"/>,
    x: <path d="M6 6l12 12M18 6L6 18"/>,
    send: <path d="M3 11l18-8-8 18-2-8-8-2z"/>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    cake: <><path d="M4 21v-5a2 2 0 012-2h12a2 2 0 012 2v5M4 21h16M7 14V9a2 2 0 012-2h6a2 2 0 012 2v5M12 3v4"/></>,
    diamond: <path d="M6 3h12l4 6-10 12L2 9l4-6z M2 9h20 M12 3l-2 6 2 12 2-12-2-6z"/>,
    cigar: <><path d="M2 12l14-3 6 3-6 3L2 12z"/><path d="M16 9v6M4 12h10"/></>,
    flame: <path d="M12 2s4 4 4 8a4 4 0 01-8 0c0-1 1-2 2-2-3 4 1 6 2 6s3-1 3-4c0-3-3-5-3-8z"/>,
    wine: <><path d="M8 3h8l-1 9a3 3 0 01-6 0L8 3zM12 15v6M8 21h8"/></>,
    crown: <path d="M3 7l4 5 5-8 5 8 4-5v11H3V7z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// Monogram-ish "MH" merke
function Monogram({ theme, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `1px solid ${theme.borderStrong}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.fontDisplay,
      color: theme.accent,
      fontSize: size * 0.42,
      fontWeight: 500,
      letterSpacing: '-1px',
      background: `radial-gradient(circle at 30% 30%, ${theme.accentSoft}, transparent 70%)`,
    }}>
      MH
    </div>
  );
}

// Generisk kort
function Card({ theme, children, style = {}, interactive = false, accent = false }) {
  return (
    <div style={{
      background: accent ? theme.accentSoft : theme.bgElevated,
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      border: `1px solid ${accent ? theme.borderStrong : theme.border}`,
      borderRadius: theme.radius,
      overflow: 'hidden',
      transition: 'transform 0.15s ease',
      ...style,
    }}>
      {children}
    </div>
  );
}

// Avatar-initialer
function Avatar({ name, size = 32, theme }) {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  // Hash til subtil fargetone
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const hue = (h % 60) + (theme.name === 'Billiard' ? 30 : theme.name === 'Mahogni' ? 10 : 40);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, oklch(0.28 0.04 ${hue}), oklch(0.18 0.03 ${hue}))`,
      color: theme.textPrimary,
      fontSize: size * 0.36,
      fontWeight: 600,
      fontFamily: theme.fontBody,
      border: `0.5px solid ${theme.border}`,
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// Placeholder-bilde (stripete, med monospace-etikett)
function Placeholder({ theme, label, aspectRatio = '16/9', type = 'event' }) {
  // Noen sceneriske gradienter per type for å gi visuell interesse
  const scenes = {
    tur: `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
          linear-gradient(135deg, oklch(0.22 0.03 230), oklch(0.14 0.04 260))`,
    møte: `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
           linear-gradient(135deg, oklch(0.2 0.02 40), oklch(0.12 0.02 30))`,
    event: `linear-gradient(180deg, ${theme.accentSoft} 0%, transparent 60%),
            linear-gradient(135deg, oklch(0.2 0.03 200), oklch(0.13 0.03 220))`,
  };
  return (
    <div style={{
      aspectRatio,
      background: scenes[type] || scenes.event,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-end',
      padding: 14,
    }}>
      {/* striper */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
        <defs>
          <pattern id={`stripes-${label}`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="4" height="8" fill={theme.accent} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#stripes-${label})`} />
      </svg>
      {label && (
        <span style={{
          fontFamily: theme.fontMono,
          fontSize: 10,
          color: theme.textTertiary,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          position: 'relative',
        }}>
          {label}
        </span>
      )}
    </div>
  );
}

// Badge/pill
function Pill({ theme, children, variant = 'neutral', small = false }) {
  const variants = {
    accent: { bg: theme.accentSoft, color: theme.accentHot, border: theme.borderStrong },
    success: { bg: 'rgba(110, 170, 120, 0.12)', color: '#94c9a2', border: 'rgba(110, 170, 120, 0.3)' },
    danger: { bg: 'rgba(200, 90, 80, 0.12)', color: '#e89b94', border: 'rgba(200, 90, 80, 0.3)' },
    neutral: { bg: theme.borderSubtle, color: theme.textSecondary, border: theme.border },
  };
  const v = variants[variant];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: small ? '2px 7px' : '3px 9px',
      fontSize: small ? 10 : 11,
      fontWeight: 600,
      fontFamily: theme.fontBody,
      letterSpacing: '0.3px',
      borderRadius: 999,
      background: v.bg,
      color: v.color,
      border: `0.5px solid ${v.border}`,
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}

// Seksjons-overskrift
function SectionLabel({ theme, children, style = {} }) {
  return (
    <div style={{
      fontFamily: theme.fontMono,
      fontSize: 10,
      fontWeight: 500,
      color: theme.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: '1.6px',
      marginBottom: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      ...style,
    }}>
      <span>{children}</span>
      <span style={{ flex: 1, height: 1, background: theme.borderSubtle }} />
    </div>
  );
}

// Bottom nav — 4 varianter. Velges via window.DOCK_VARIANT (default 'pill')
const DOCK_VARIANTS = ['pill', 'underscore', 'monogram', 'floating'];

function BottomNav({ theme, active, onNavigate }) {
  const variant = window.DOCK_VARIANT || 'pill';
  const tabs = [
    { id: 'hjem', label: 'Agenda', icon: 'calendar' },
    { id: 'klubbinfo', label: 'Klubb', icon: 'building' },
    { id: 'kaaringer', label: 'Kåringer', icon: 'trophy' },
    { id: 'profil', label: 'Profil', icon: 'user' },
  ];

  // ── VARIANT 1: PILL — liquid glass, flerlags highlights + glass-bubble indicator
  if (variant === 'pill') {
    return (
      <div style={{
        position: 'absolute', bottom: 14, left: 16, right: 16, zIndex: 30,
        borderRadius: 999, padding: 6, display: 'flex',
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%),
          ${theme.bgElevated2}
        `,
        backdropFilter: 'blur(40px) saturate(200%) brightness(1.1)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%) brightness(1.1)',
        border: `0.5px solid rgba(255,255,255,0.12)`,
        boxShadow: `
          0 12px 40px rgba(0,0,0,0.55),
          0 2px 10px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.14),
          inset 0 -1px 0 rgba(255,255,255,0.03),
          inset 0 0 20px rgba(255,255,255,0.02)
        `,
        overflow: 'hidden',
      }}>
        {/* Top glint overlay */}
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: '45%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)',
          borderRadius: '999px 999px 50% 50%',
          pointerEvents: 'none',
          filter: 'blur(2px)',
        }} />
        {/* Subtle chromatic sheen */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 999,
          background: `radial-gradient(ellipse 60% 100% at 30% 0%, ${theme.accentSoft} 0%, transparent 60%)`,
          opacity: 0.4,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }} />

        {tabs.map((t, idx) => {
          const isActive = active === t.id;
          const isProfile = t.id === 'profil';
          // Separator mellom Kåringer og Profil
          const showSeparator = idx === tabs.length - 1;
          return (
            <React.Fragment key={t.id}>
              {showSeparator && (
                <span style={{
                  width: 0.5, margin: '10px 4px',
                  background: `linear-gradient(180deg, transparent 0%, ${theme.borderStrong} 50%, transparent 100%)`,
                  opacity: 0.6, flexShrink: 0,
                }} />
              )}
              <button onClick={() => onNavigate(t.id)} style={{
                position: 'relative',
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '8px 0 6px', border: 'none', borderRadius: 999,
                background: 'transparent',
                color: isActive ? theme.accent : theme.textTertiary,
                cursor: 'pointer', fontFamily: theme.fontBody,
                fontSize: 10, fontWeight: 500, transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 2,
              }}>
                {isActive && (
                  <>
                    {/* Glass-bubble bak aktiv */}
                    <span style={{
                      position: 'absolute', inset: 2,
                      borderRadius: 999,
                      background: `
                        linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.12) 100%),
                        ${theme.accentSoft}
                      `,
                      border: '0.5px solid rgba(255,255,255,0.22)',
                      boxShadow: `
                        inset 0 1px 0 rgba(255,255,255,0.35),
                        inset 0 -1px 0 rgba(255,255,255,0.05),
                        inset 0 0 12px rgba(255,255,255,0.06),
                        0 2px 8px rgba(0,0,0,0.2)
                      `,
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      zIndex: -1,
                    }} />
                    <span style={{
                      position: 'absolute', top: 3, left: '15%', right: '15%', height: 10,
                      borderRadius: '999px 999px 50% 50%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
                      pointerEvents: 'none',
                      filter: 'blur(1.5px)',
                      zIndex: -1,
                    }} />
                  </>
                )}
                {isProfile ? (
                  // Profil = avatar-disk, ikke ikon
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.bgElevated})`,
                    border: `1px solid ${isActive ? theme.accent : theme.borderStrong}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: theme.fontDisplay, fontSize: 11, fontWeight: 500,
                    color: isActive ? theme.accent : theme.textSecondary,
                    boxShadow: isActive
                      ? `0 0 0 2px ${theme.accentSoft}, inset 0 1px 0 rgba(255,255,255,0.2)`
                      : `inset 0 1px 0 rgba(255,255,255,0.08)`,
                    transition: 'all 0.25s',
                  }}>T</div>
                ) : (
                  <Icon name={t.icon} size={20} color={isActive ? theme.accent : theme.textTertiary} strokeWidth={isActive ? 1.8 : 1.4} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{t.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // ── VARIANT 2: UNDERSCORE — bred mørk linje med tynn accent-stripe over aktiv
  if (variant === 'underscore') {
    return (
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
        paddingBottom: 20, paddingTop: 10,
        background: `linear-gradient(180deg, transparent 0%, ${theme.bgElevated2} 40%)`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderTop: `0.5px solid ${theme.borderSubtle}`,
        display: 'flex',
      }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} style={{
              flex: 1, position: 'relative',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4,
              padding: '10px 0 6px', border: 'none', background: 'transparent',
              color: isActive ? theme.accent : theme.textTertiary,
              cursor: 'pointer', fontFamily: theme.fontBody,
              fontSize: 10, fontWeight: 500, letterSpacing: '0.5px',
            }}>
              {isActive && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 24, height: 1.5, background: theme.accent, borderRadius: 2,
                  boxShadow: `0 0 8px ${theme.accent}`,
                }} />
              )}
              <Icon name={t.icon} size={22} color={isActive ? theme.accent : theme.textTertiary} strokeWidth={isActive ? 1.8 : 1.3} />
              <span style={{ textTransform: 'uppercase', fontFamily: theme.fontMono, fontSize: 9, letterSpacing: '1.5px' }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ── VARIANT 3: MONOGRAM — kompakt pill med monogram-cirkel i midten (CTA/hjem)
  if (variant === 'monogram') {
    const left = tabs.slice(0, 2);
    const right = tabs.slice(2);
    return (
      <div style={{
        position: 'absolute', bottom: 14, left: 16, right: 16, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: theme.bgElevated2,
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        borderRadius: 999, padding: '6px 10px',
        border: `0.5px solid ${theme.borderSubtle}`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.06)`,
      }}>
        {left.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 0', border: 'none', background: 'transparent',
              color: isActive ? theme.accent : theme.textTertiary, cursor: 'pointer',
            }}>
              <Icon name={t.icon} size={22} color={isActive ? theme.accent : theme.textTertiary} strokeWidth={isActive ? 1.9 : 1.4} />
            </button>
          );
        })}
        {/* Monogram-knapp */}
        <button onClick={() => onNavigate('hjem')} style={{
          width: 50, height: 50, borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${theme.accentSoft}, ${theme.bgElevated})`,
          border: `1px solid ${theme.borderStrong}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.fontDisplay, fontSize: 20, fontWeight: 500,
          color: theme.accent, cursor: 'pointer',
          marginInline: 8,
          boxShadow: `0 4px 16px ${theme.accentSoft}, 0 0 0 3px ${theme.bgElevated2}`,
        }}>MH</button>
        {right.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 0', border: 'none', background: 'transparent',
              color: isActive ? theme.accent : theme.textTertiary, cursor: 'pointer',
            }}>
              <Icon name={t.icon} size={22} color={isActive ? theme.accent : theme.textTertiary} strokeWidth={isActive ? 1.9 : 1.4} />
            </button>
          );
        })}
      </div>
    );
  }

  // ── VARIANT 4: FLOATING — mindre flytende pill sentrert, bare ikoner + glødende dot
  if (variant === 'floating') {
    return (
      <div style={{
        position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
        zIndex: 30,
        background: 'rgba(18,18,22,0.82)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        borderRadius: 999, padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 4,
        border: `0.5px solid ${theme.border}`,
        boxShadow: `0 14px 40px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.08)`,
      }}>
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onNavigate(t.id)} style={{
              position: 'relative',
              width: 52, height: 42, borderRadius: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none',
              background: isActive ? theme.accentSoft : 'transparent',
              color: isActive ? theme.accent : theme.textSecondary,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
              <Icon name={t.icon} size={20} color={isActive ? theme.accent : theme.textSecondary} strokeWidth={isActive ? 1.9 : 1.4} />
              {isActive && (
                <span style={{
                  position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%',
                  background: theme.accent, boxShadow: `0 0 6px ${theme.accent}`,
                }} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return null;
}

window.DOCK_VARIANTS = DOCK_VARIANTS;
Object.assign(window, { Icon, Monogram, Card, Avatar, Placeholder, Pill, SectionLabel, BottomNav });

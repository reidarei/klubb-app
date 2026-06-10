// Fem varianter av Obsidian — alle med ren, minimalistisk karakter,
// men med gradvis økende varme i bakgrunn, aksenter og glød.

const THEMES = {
  obsidian_classic: {
    name: 'Obsidian',
    tagline: 'Opprinnelig · kjølig blåsvart',
    bg: `
      radial-gradient(ellipse 100% 60% at 50% 0%, rgba(100, 130, 200, 0.12) 0%, transparent 55%),
      radial-gradient(ellipse 70% 50% at 0% 100%, rgba(90, 70, 180, 0.14) 0%, transparent 60%),
      linear-gradient(180deg, #0a0a0c 0%, #060608 100%)
    `,
    bgElevated: 'rgba(20, 20, 24, 0.72)',
    bgElevated2: 'rgba(30, 30, 36, 0.82)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.2)',
    borderSubtle: 'rgba(255, 255, 255, 0.04)',
    textPrimary: '#f5f5f7',
    textSecondary: '#9ea0a8',
    textTertiary: '#5c5e68',
    accent: '#e8d9b5',
    accentSoft: 'rgba(232, 217, 181, 0.1)',
    accentHot: '#f5e8c8',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_candlelight: {
    name: 'Obsidian · Stearinlys',
    tagline: 'Hvelving i svart · varm bloom øverst',
    bg: `
      radial-gradient(ellipse 120% 55% at 50% -10%, rgba(240, 190, 120, 0.14) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 15% 105%, rgba(210, 140, 80, 0.08) 0%, transparent 55%),
      linear-gradient(180deg, #0d0a08 0%, #080605 100%)
    `,
    bgElevated: 'rgba(26, 22, 18, 0.72)',
    bgElevated2: 'rgba(36, 30, 24, 0.85)',
    border: 'rgba(240, 200, 150, 0.1)',
    borderStrong: 'rgba(240, 200, 150, 0.26)',
    borderSubtle: 'rgba(255, 230, 200, 0.05)',
    textPrimary: '#f5ece0',
    textSecondary: '#a89a88',
    textTertiary: '#625a50',
    accent: '#f0c990',
    accentSoft: 'rgba(240, 201, 144, 0.1)',
    accentHot: '#fbd9a8',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_amber: {
    name: 'Obsidian · Amber',
    tagline: 'Varm glød · kobber-aksent',
    bg: `
      radial-gradient(ellipse 110% 60% at 50% 0%, rgba(220, 145, 75, 0.18) 0%, transparent 55%),
      radial-gradient(ellipse 70% 50% at 100% 110%, rgba(200, 110, 60, 0.12) 0%, transparent 60%),
      linear-gradient(180deg, #0f0a07 0%, #0a0604 100%)
    `,
    bgElevated: 'rgba(32, 24, 18, 0.76)',
    bgElevated2: 'rgba(44, 32, 24, 0.88)',
    border: 'rgba(220, 145, 75, 0.14)',
    borderStrong: 'rgba(220, 145, 75, 0.32)',
    borderSubtle: 'rgba(255, 220, 180, 0.05)',
    textPrimary: '#f3e4d0',
    textSecondary: '#ab9583',
    textTertiary: '#6a574a',
    accent: '#dc914b',
    accentSoft: 'rgba(220, 145, 75, 0.12)',
    accentHot: '#f0a868',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_espresso: {
    name: 'Obsidian · Espresso',
    tagline: 'Dyp brun-sort · krem-aksent',
    bg: `
      radial-gradient(ellipse 100% 55% at 50% 0%, rgba(200, 165, 125, 0.12) 0%, transparent 55%),
      radial-gradient(ellipse 65% 55% at 0% 110%, rgba(90, 50, 30, 0.3) 0%, transparent 60%),
      linear-gradient(180deg, #120d0a 0%, #0b0706 55%, #080504 100%)
    `,
    bgElevated: 'rgba(34, 26, 22, 0.8)',
    bgElevated2: 'rgba(46, 34, 28, 0.9)',
    border: 'rgba(200, 165, 125, 0.12)',
    borderStrong: 'rgba(200, 165, 125, 0.3)',
    borderSubtle: 'rgba(240, 220, 200, 0.05)',
    textPrimary: '#eee0cc',
    textSecondary: '#a69484',
    textTertiary: '#6a5a4d',
    accent: '#c8a57d',
    accentSoft: 'rgba(200, 165, 125, 0.11)',
    accentHot: '#dbbb93',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_ember: {
    name: 'Obsidian · Ember',
    tagline: 'Peiskull · dyp varme fra bunnen',
    bg: `
      radial-gradient(ellipse 90% 45% at 50% 0%, rgba(255, 180, 120, 0.08) 0%, transparent 55%),
      radial-gradient(ellipse 120% 55% at 50% 115%, rgba(230, 100, 50, 0.22) 0%, transparent 65%),
      linear-gradient(180deg, #0a0807 0%, #080505 60%, #0d0706 100%)
    `,
    bgElevated: 'rgba(28, 22, 20, 0.74)',
    bgElevated2: 'rgba(40, 28, 24, 0.86)',
    border: 'rgba(255, 170, 120, 0.11)',
    borderStrong: 'rgba(255, 170, 120, 0.28)',
    borderSubtle: 'rgba(255, 220, 200, 0.05)',
    textPrimary: '#f5e5d4',
    textSecondary: '#ae968a',
    textTertiary: '#6a564c',
    accent: '#e89466',
    accentSoft: 'rgba(232, 148, 102, 0.12)',
    accentHot: '#faae82',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_aurora: {
    name: 'Obsidian · Aurora',
    tagline: 'Nordlys · elektrisk grønn over mørkt blått',
    bg: `
      radial-gradient(ellipse 110% 55% at 30% 0%, rgba(80, 220, 170, 0.14) 0%, transparent 55%),
      radial-gradient(ellipse 90% 60% at 85% 110%, rgba(90, 120, 220, 0.18) 0%, transparent 60%),
      linear-gradient(180deg, #060a0c 0%, #04070a 100%)
    `,
    bgElevated: 'rgba(18, 24, 28, 0.74)',
    bgElevated2: 'rgba(26, 34, 40, 0.86)',
    border: 'rgba(140, 220, 200, 0.1)',
    borderStrong: 'rgba(140, 220, 200, 0.28)',
    borderSubtle: 'rgba(200, 240, 230, 0.05)',
    textPrimary: '#e8f4ee',
    textSecondary: '#8ea0a0',
    textTertiary: '#516268',
    accent: '#6cd6b0',
    accentSoft: 'rgba(108, 214, 176, 0.12)',
    accentHot: '#8ee8c4',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_ultramarine: {
    name: 'Obsidian · Ultramarin',
    tagline: 'Dyp havblå · klar koboltaksent',
    bg: `
      radial-gradient(ellipse 120% 60% at 50% 0%, rgba(80, 130, 240, 0.22) 0%, transparent 55%),
      radial-gradient(ellipse 80% 50% at 0% 105%, rgba(60, 90, 220, 0.16) 0%, transparent 60%),
      linear-gradient(180deg, #050812 0%, #030510 100%)
    `,
    bgElevated: 'rgba(16, 22, 38, 0.76)',
    bgElevated2: 'rgba(24, 32, 54, 0.88)',
    border: 'rgba(130, 165, 255, 0.12)',
    borderStrong: 'rgba(130, 165, 255, 0.3)',
    borderSubtle: 'rgba(200, 220, 255, 0.05)',
    textPrimary: '#eaecf8',
    textSecondary: '#9097b0',
    textTertiary: '#555c78',
    accent: '#7aa4ff',
    accentSoft: 'rgba(122, 164, 255, 0.14)',
    accentHot: '#9cbeff',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_viola: {
    name: 'Obsidian · Viola',
    tagline: 'Natt-orkidé · dyp fiolett med magenta glød',
    bg: `
      radial-gradient(ellipse 100% 55% at 50% 0%, rgba(180, 110, 240, 0.18) 0%, transparent 55%),
      radial-gradient(ellipse 75% 55% at 100% 110%, rgba(230, 100, 180, 0.14) 0%, transparent 60%),
      linear-gradient(180deg, #0a0610 0%, #07040c 100%)
    `,
    bgElevated: 'rgba(24, 18, 32, 0.78)',
    bgElevated2: 'rgba(34, 24, 46, 0.88)',
    border: 'rgba(200, 150, 240, 0.12)',
    borderStrong: 'rgba(200, 150, 240, 0.3)',
    borderSubtle: 'rgba(230, 200, 255, 0.05)',
    textPrimary: '#efe6f5',
    textSecondary: '#a095ad',
    textTertiary: '#625670',
    accent: '#c88cf0',
    accentSoft: 'rgba(200, 140, 240, 0.13)',
    accentHot: '#dca8f7',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },

  obsidian_verdigris: {
    name: 'Obsidian · Verdigris',
    tagline: 'Oksidert kobber · støvet turkis',
    bg: `
      radial-gradient(ellipse 110% 55% at 40% 0%, rgba(90, 180, 170, 0.14) 0%, transparent 55%),
      radial-gradient(ellipse 70% 55% at 100% 105%, rgba(60, 140, 140, 0.1) 0%, transparent 60%),
      linear-gradient(180deg, #06090a 0%, #040708 100%)
    `,
    bgElevated: 'rgba(18, 26, 26, 0.76)',
    bgElevated2: 'rgba(24, 36, 36, 0.88)',
    border: 'rgba(130, 200, 190, 0.1)',
    borderStrong: 'rgba(130, 200, 190, 0.28)',
    borderSubtle: 'rgba(200, 230, 225, 0.05)',
    textPrimary: '#e4eeec',
    textSecondary: '#8a9e9a',
    textTertiary: '#506460',
    accent: '#5fb8a8',
    accentSoft: 'rgba(95, 184, 168, 0.12)',
    accentHot: '#83d0c0',
    fontDisplay: '"Instrument Serif", Georgia, serif',
    fontBody: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", monospace',
    texture: 'obsidian',
    radius: '18px',
  },
};

// Tekstur — Obsidian er ren; subtile støvkorn valgfritt per variant.
function ThemeTexture({ variant }) {
  // Alle Obsidian-varianter bruker samme rene, nesten-usynlige grain
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <defs>
        <pattern id="ob-grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="transparent"/>
          <rect x="0" y="0" width="1" height="1" fill="#fff" opacity="0.025"/>
          <rect x="2" y="1" width="1" height="1" fill="#000" opacity="0.08"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ob-grain)"/>
    </svg>
  );
}

window.THEMES = THEMES;
window.ThemeTexture = ThemeTexture;

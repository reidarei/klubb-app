import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import VitalsLogger from '@/components/VitalsLogger'
import TemaSync from '@/components/TemaSync'
import FeilFangst from '@/components/FeilFangst'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_BESKRIVELSE } from '@/lib/klubb-config'
import { MANIFEST_FARGER } from '@/lib/tema'
import { TEMA_STORAGE_KEY } from '@/lib/konstanter'
import { lesTemaFraCookie, resolveServerTema } from '@/lib/tema-server'
import './globals.css'

// Font-diett (#391): hver vekt = egen woff2-fil som må lastes på kald start
// (iOS kaster PWA-cachen etter lengre inaktivitet). 700 er droppet — de få
// stedene som brukte den er flyttet til 600. Ikke legg til vekter uten å
// veie mot kald-last-kostnaden.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
})

// Mono brukes nesten utelukkende som 600 (små uppercase-etiketter). De få
// 400/500-stedene får 600 via CSS font-matching (eneste tilgjengelige vekt)
// — visuelt likt på 10-11px. Sparer to font-filer på kald start. (#391)
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: '600',
  variable: '--font-jetbrains',
  display: 'swap',
})

export const viewport: Viewport = {
  viewportFit: 'cover',
  maximumScale: 1,
  userScalable: false,
  // Safari støtter ikke `interactive-widget` i noen versjon — direktivet har
  // ALDRI hatt effekt på iPhone, uansett hvilken verdi som står her. På
  // Android Chromium derimot gjør 'overlays-content' nøyaktig det spec-en
  // sier: slår av visualViewport-krympingen som ALLE tastatur-hooks i
  // components/chat/hooks/useKeyboardOffset.ts hviler på — det var årsaken
  // til #731. Dock-begrunnelsen falt uansett bort da bottom-nav ble fjernet.
  // 'resizes-content' er heller ikke et alternativ: den krymper layout
  // viewport i tillegg, så innerHeight−vv.height blir 0 og formelen brekker
  // fra den andre siden. Sett eksplisitt (ikke fjern linja) — 'resizes-visual'
  // er default, men verdien er dokumentasjon for neste mann som fristes til
  // å prøve 'overlays-content' igjen.
  interactiveWidget: 'resizes-visual',
}

export const metadata: Metadata = {
  title: KLUBB_NAVN,
  description: KLUBB_BESKRIVELSE,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: KLUBB_KORTNAVN,
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const valgtTema = await lesTemaFraCookie()
  const resolved = resolveServerTema(valgtTema)

  // Default-verdiene fra lib/klubb-config matcher allerede globals.css,
  // så vi sløyfer injeksjon når env-var ikke er satt — sparer bytes og holder DOM-en ren.
  // Selektor må matche begge tema-blokkene i globals.css, ellers taper overridene på spesifisitet.
  const klubbOverrides = [
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER && `--accent: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_SOFT && `--accent-soft: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_SOFT};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_HOT && `--accent-hot: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_HOT};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_BAKGRUNN && `--bg: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_BAKGRUNN};`,
  ].filter(Boolean).join(' ')

  return (
    <html
      lang="nb"
      data-theme={resolved}
      className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`}
    >
      <head>
        {/* Pre-hydration-script: kjører synkront før nettleseren tegner første pixel.
            Les localStorage (raskest) → cookie-verdi → resolv system-preferanse om nødvendig.
            Forhindrer FOUC når bruker har valgt light eller system=light. */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{
var lagret = localStorage.getItem('${TEMA_STORAGE_KEY}');
var cookie = ${JSON.stringify(valgtTema)};
// Valider lagret-verdien — korrupt/ukjent verdi (f.eks. 'blue') skal ikke
// overstyre cookie. Speiler TEMA_VALG i lib/konstanter.ts.
var valid = lagret === 'system' || lagret === 'dark' || lagret === 'light';
var valg = valid ? lagret : cookie;
var resolved = valg === 'system'
  ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  : valg;
if (resolved === 'light' || resolved === 'dark') {
  document.documentElement.setAttribute('data-theme', resolved);
  // Pre-hydration kjører før CSS er parset — getComputedStyle på --bg
  // kan returnere tom streng her. Hardkod verdiene som speiler globals.css
  // (post-hydration tar settDataTheme i lib/tema-klient over og leser CSS).
  var bg = resolved === 'light' ? '#f4f2ec' : '#0e0f13';
  var m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', bg);
}
}catch(e){}})();`
        }} />
        <meta name="theme-color" content={MANIFEST_FARGER.tema} />
        {/* Klubb-overrides treffer kun dark — kremgul aksent har dårlig
            kontrast på lyst papir. Klubb-spesifikke light-overrides kan
            introduseres som eget issue ved behov. */}
        {klubbOverrides && <style>{`:root[data-theme="dark"] { ${klubbOverrides} }`}</style>}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      <body>
        {/* TemaSync kobler localStorage og system-mq til data-theme etter hydration */}
        <TemaSync initial={valgtTema} />
        {/* FeilFangst lytter på window.error og unhandledrejection globalt. Se #366. */}
        <FeilFangst />
        {children}
        <div className="orientering-overlay" role="alert" aria-live="polite">
          <div style={{ fontSize: 40, lineHeight: 1 }}>↻</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Roter telefonen</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320 }}>
            {KLUBB_KORTNAVN} fungerer best i portrett-modus.
          </div>
        </div>
        {/* Vercel Speed Insights er bevisst fjernet (#391): hele brukerflåten
            er iOS-PWA der ITP blokkerer beacon-en — scriptet kostet en request
            på hver kald start uten å levere data. VitalsLogger (egen endpoint,
            slipper gjennom ITP) er eneste RUM-kilde. */}
        <VitalsLogger />
      </body>
    </html>
  )
}

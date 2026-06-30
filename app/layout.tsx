import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import VitalsLogger from '@/components/VitalsLogger'
import TemaSync from '@/components/TemaSync'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_BESKRIVELSE } from '@/lib/klubb-config'
import { MANIFEST_FARGER } from '@/lib/tema'
import { TEMA_STORAGE_KEY } from '@/lib/konstanter'
import { lesTemaFraCookie, resolveServerTema } from '@/lib/tema-server'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const viewport: Viewport = {
  viewportFit: 'cover',
  maximumScale: 1,
  userScalable: false,
  // iOS 16.4+: tastaturet overlapper viewport istedenfor å krympe det.
  // Effekt: position:fixed-elementer (dock) blir naturlig dekket av tastatur
  // når det er oppe, kommer tilbake når det går ned — uten JS-deteksjon.
  // Forsøk på å løse dock-bug-klassen (#99, #104, #147, #151, #153).
  interactiveWidget: 'overlays-content',
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
        {children}
        <div className="orientering-overlay" role="alert" aria-live="polite">
          <div style={{ fontSize: 40, lineHeight: 1 }}>↻</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Roter telefonen</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320 }}>
            {KLUBB_KORTNAVN} fungerer best i portrett-modus.
          </div>
        </div>
        <SpeedInsights />
        <VitalsLogger />
      </body>
    </html>
  )
}

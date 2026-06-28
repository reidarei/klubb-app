import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import VitalsLogger from '@/components/VitalsLogger'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_BESKRIVELSE } from '@/lib/klubb-config'
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Default-verdiene fra lib/klubb-config matcher allerede globals.css,
  // så vi sløyfer injeksjon når env-var ikke er satt — sparer bytes og holder DOM-en ren.
  // Selektor må matche dark-blokken i globals.css (`:root[data-theme="dark"]`), ellers
  // taper overridene på spesifisitet siden html-roten har data-theme="dark" satt.
  // Med samme spesifisitet vinner overridene fordi de kommer senere i kilde-rekkefølgen.
  const klubbOverrides = [
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER && `--accent: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_SOFT && `--accent-soft: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_SOFT};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_HOT && `--accent-hot: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_HOT};`,
    process.env.NEXT_PUBLIC_KLUBB_FARGE_BAKGRUNN && `--bg: ${process.env.NEXT_PUBLIC_KLUBB_FARGE_BAKGRUNN};`,
  ].filter(Boolean).join(' ')

  return (
    <html
      lang="nb"
      data-theme="dark"
      className={`${inter.variable} ${instrument.variable} ${jetbrains.variable}`}
    >
      <head>
        <meta name="theme-color" content="#060608" />
        {klubbOverrides && <style>{`:root[data-theme="dark"] { ${klubbOverrides} }`}</style>}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      <body>
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

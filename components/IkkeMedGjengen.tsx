import IkkeMedGjengenLoggUt from '@/components/IkkeMedGjengenLoggUt'

// Innlogget bruker uten aktivt medlemskap i klubben (#870): aktiv_klubb() er null, så RLS gir ham
// ingenting. Rendres fra (app)/layout.tsx i stedet for faner og innhold. Ingen redirect: /login
// sender innloggede til /, så en redirect hit ville gitt en evig løkke (jf. middleware.ts).
export default function IkkeMedGjengen() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--text-primary)',
      }}
    >
      <p style={{ fontFamily: 'var(--font-body)', fontSize: 17, margin: 0 }}>Du er ikke medlem i en klubb.</p>
      <IkkeMedGjengenLoggUt />
    </main>
  )
}

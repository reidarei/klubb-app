export default function SladdetFelt({ bredde = '7rem' }: { bredde?: string }) {
  return (
    <span
      className="inline-block align-middle select-none"
      style={{
        // ren svart sladd, ikke app-bakgrunn-farge
        background: '#000',
        width: bredde,
        height: '1.1em',
        borderRadius: '1px',
        border: '1px solid var(--border)',
        verticalAlign: 'middle',
        display: 'inline-block',
      }}
      title="Sensurert"
    />
  )
}

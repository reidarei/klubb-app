export default function SladdetFelt({ bredde = '7rem' }: { bredde?: string }) {
  return (
    <span
      className="inline-block align-middle select-none"
      style={{
        background: '#000',
        width: bredde,
        height: '1.1em',
        borderRadius: '1px',
        border: '1px solid rgba(255,255,255,0.15)',
        verticalAlign: 'middle',
        display: 'inline-block',
      }}
      title="Sensurert"
    />
  )
}

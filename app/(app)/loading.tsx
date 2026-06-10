export default function Loading() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-36 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
        <div className="h-8 w-16 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="h-4 w-1/4 rounded mb-2" style={{ background: 'var(--border)' }} />
            <div className="h-5 w-2/3 rounded mb-3" style={{ background: 'var(--border)' }} />
            <div className="h-3 w-1/2 rounded" style={{ background: 'var(--border)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

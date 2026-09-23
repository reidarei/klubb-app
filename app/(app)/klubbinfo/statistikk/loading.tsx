export default function Loading() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-4 w-16 rounded animate-pulse" style={{ background: 'var(--border)' }} />
        <div className="h-7 w-24 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[1, 2].map(i => (
          <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="h-8 w-12 rounded mx-auto mb-2" style={{ background: 'var(--border)' }} />
            <div className="h-3 w-20 rounded mx-auto" style={{ background: 'var(--border)' }} />
          </div>
        ))}
      </div>
      <div className="h-4 w-20 rounded mb-3 animate-pulse" style={{ background: 'var(--border)' }} />
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="grid grid-cols-4 px-4 py-2.5 animate-pulse" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div className="col-span-2 h-4 w-24 rounded" style={{ background: 'var(--border)' }} />
            <div className="h-4 w-6 rounded ml-auto" style={{ background: 'var(--border)' }} />
            <div className="h-4 w-6 rounded ml-auto" style={{ background: 'var(--border)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

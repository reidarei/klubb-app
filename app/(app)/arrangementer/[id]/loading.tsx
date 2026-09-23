export default function Loading() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <div className="flex items-center justify-between mb-5">
        <div className="h-4 w-16 rounded animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
      <div className="h-5 w-12 rounded-full mb-2 animate-pulse" style={{ background: 'var(--border)' }} />
      <div className="h-8 w-3/4 rounded-lg mb-4 animate-pulse" style={{ background: 'var(--border)' }} />
      <div className="space-y-2 mb-5">
        <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: 'var(--border)' }} />
        <div className="h-4 w-1/2 rounded animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 flex-1 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded animate-pulse" style={{ background: 'var(--border)' }} />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 w-20 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

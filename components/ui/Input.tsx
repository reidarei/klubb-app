import { InputHTMLAttributes } from 'react'

export default function Input({
  label,
  className = '',
  ...props
}: {
  label?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      {label && (
        <label
          htmlFor={props.id}
          className="block text-sm font-medium mb-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-xl px-4 py-3 text-base focus:outline-none transition-colors ${className}`}
        style={{
          background: 'var(--bg-elevated-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
        {...props}
      />
    </div>
  )
}

export function Textarea({
  label,
  className = '',
  ...props
}: {
  label?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && (
        <label
          htmlFor={props.id}
          className="block text-sm font-medium mb-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <textarea
        className={`w-full rounded-xl px-4 py-3 text-base focus:outline-none transition-colors ${className}`}
        style={{
          background: 'var(--bg-elevated-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
        {...props}
      />
    </div>
  )
}

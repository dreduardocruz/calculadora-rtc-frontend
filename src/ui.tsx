import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <div className="flex items-center gap-2">
        {icon && <span className="text-sky-400">{icon}</span>}
        <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">{children}</h2>
      </div>
      {right}
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
  step?: string
  min?: string
}

export function Field({ label, value, onChange, type = 'text', placeholder, className, step, min }: FieldProps) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <input
        type={type}
        value={value}
        step={step}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition
                   placeholder:text-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
      />
    </label>
  )
}

export function Select({ label, value, onChange, options, className }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { code: string; name?: string }[]
  className?: string
}) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition
                   focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name ? `${o.code} — ${o.name}` : o.code}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200"
    >
      <span className={clsx(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-sky-500' : 'bg-zinc-700',
      )}>
        <span className={clsx(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )} />
      </span>
      {label}
    </button>
  )
}

export function Btn({ children, onClick, variant = 'primary', className, disabled }: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
  disabled?: boolean
}) {
  const styles = {
    primary: 'bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20',
    ghost: 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 border border-zinc-700/60',
    danger: 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98]',
        styles[variant],
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

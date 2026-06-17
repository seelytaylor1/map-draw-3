import { useState, type ReactNode } from 'react'
import { IconChevron } from './icons'

export function Section({ title, icon, defaultOpen = false, children }: {
  title: string
  icon: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <button className={`section-header${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="section-icon">{icon}</span>
        {title}
        <span className="chev"><IconChevron size={13} /></span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

export function ToolButton({ icon, label, active, onClick, tone }: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  tone?: 'iso'
}) {
  return (
    <button className={`tool-btn${active ? ' active' : ''}${tone ? ` ${tone}` : ''}`} onClick={onClick}>
      <span className="icon">{icon}</span>
      {label}
    </button>
  )
}

export function IconToggle({ icon, active, onClick, tone, disabled, title }: {
  icon: ReactNode
  active: boolean
  onClick: () => void
  tone?: 'iso'
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      className={`icon-toggle${active ? ' active' : ''}${tone ? ` ${tone}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
    </button>
  )
}

export function Segmented<T extends string | number>({ options, value, onChange, tones }: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  tones?: Partial<Record<T, 'water' | 'lava' | 'darkness' | 'erase'>>
}) {
  return (
    <div className="segmented">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`${value === opt.value ? 'active' : ''}${tones?.[opt.value] ? ` tone-${tones[opt.value]}` : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}{opt.label}
        </button>
      ))}
    </div>
  )
}

export function ColorField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="color-field">
      <label>{label}</label>
      <input className="swatch" type="color" value={value} onChange={e => onChange(e.target.value)} />
      <span className="hex">{value}</span>
    </div>
  )
}

export function Btn({ children, onClick, variant, title }: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'danger'
  title?: string
}) {
  return (
    <button
      className={`btn${variant ? ` btn-${variant}` : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

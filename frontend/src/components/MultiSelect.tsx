import { useEffect, useRef, useState } from "react"

// Los valores elegidos viajan como un solo texto separado por "|" (ej. "Mexico|Peru"): así los
// filtros siguen siendo string y el backend los separa (ver splitFilterValues).
export const FILTER_SEPARATOR = "|"

export function splitSelected(value: string): string[] {
  return value ? value.split(FILTER_SEPARATOR).filter(Boolean) : []
}

type Option = string | number | { value: string; label: string }

interface Props {
  label: string // texto cuando no hay nada elegido, ej. "All countries"
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
}

// Lista desplegable con casillas para elegir varios valores del mismo filtro a la vez.
export default function MultiSelect({ label, value, onChange, options, className = "" }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = splitSelected(value)
  const items = options.map((o) => (typeof o === "object" ? o : { value: String(o), label: String(o) }))

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
    onChange(next.join(FILTER_SEPARATOR))
  }

  const text =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (items.find((i) => i.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${className} flex items-center justify-between gap-2 text-left`}>
        <span className="truncate">{text}</span>
        <span className="text-xs text-zinc-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 min-w-full w-max max-w-xs overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange("")} className="w-full px-2 py-1.5 text-left text-xs text-blue-400 hover:text-blue-300">
              Clear selection
            </button>
          )}
          {items.length === 0 && <p className="px-2 py-1.5 text-sm text-zinc-500">No options</p>}
          {items.map((i) => (
            <label key={i.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-white hover:bg-zinc-800">
              <input type="checkbox" checked={selected.includes(i.value)} onChange={() => toggle(i.value)} />
              {i.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from "react"
import { getClientFilterOptions, type ClientFilterOptions } from "../services/clients"

export type ReportFilterValue = {
  country: string
  collectorId: string
  team: string
  teamLeader: string
  collector: string
}

export const EMPTY_REPORT_FILTERS: ReportFilterValue = {
  country: "",
  collectorId: "",
  team: "",
  teamLeader: "",
  collector: "",
}

const EMPTY_OPTIONS: ClientFilterOptions = {
  country: [], collectorId: [], team: [], teamLeader: [], collector: [],
}

// Compartido entre la barra de filtros inline (Dashboard/Calls) y el modal de export
// (ExportCallsModal) — GET /clients/filter-options trae los valores distintos vía
// Client.distinct() en vez de derivarse de una lista de clientes ya cargada, que en
// GET /clients viene paginada (una opción que solo existiera pasada la primera página
// nunca hubiera aparecido en el <select>).
export function useClientFilterOptions(): ClientFilterOptions {
  const [options, setOptions] = useState<ClientFilterOptions>(EMPTY_OPTIONS)
  useEffect(() => {
    getClientFilterOptions().then(setOptions).catch(() => {})
  }, [])
  return options
}

function FilterSelect({
  label, value, onChange, options, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: (string | number)[]
  className: string
}) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={String(o)}>{o}</option>
      ))}
    </select>
  )
}

// Los 5 campos de los filtros de "Reporte Filters": Country / Collector ID / Team /
// Team Leader / Collector (ver models/Client.ts). Un solo componente de campos, para que
// la barra inline y el modal de export rendericen exactamente los mismos <select> con
// las mismas opciones — solo cambia el layout que lo envuelve.
export function ReportFilterFields({
  value,
  onChange,
  options,
  selectClassName = "rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white min-w-36",
}: {
  value: ReportFilterValue
  onChange: (value: ReportFilterValue) => void
  options: ClientFilterOptions
  selectClassName?: string
}) {
  function set(field: keyof ReportFilterValue, v: string) {
    onChange({ ...value, [field]: v })
  }
  return (
    <>
      <FilterSelect label="All countries" value={value.country} onChange={(v) => set("country", v)} options={options.country} className={selectClassName} />
      <FilterSelect label="All collector IDs" value={value.collectorId} onChange={(v) => set("collectorId", v)} options={options.collectorId} className={selectClassName} />
      <FilterSelect label="All teams" value={value.team} onChange={(v) => set("team", v)} options={options.team} className={selectClassName} />
      <FilterSelect label="All team leaders" value={value.teamLeader} onChange={(v) => set("teamLeader", v)} options={options.teamLeader} className={selectClassName} />
      <FilterSelect label="All collectors" value={value.collector} onChange={(v) => set("collector", v)} options={options.collector} className={selectClassName} />
    </>
  )
}

// Barra de filtros inline usada en el Dashboard (filtra la tabla de clientes) y en Calls
// (filtra la tabla). El export en Calls usa su propio modal (ExportCallsModal), que pide
// estos mismos 5 filtros por separado en vez de depender de esta barra.
export default function ReportFilters({
  value,
  onChange,
}: {
  value: ReportFilterValue
  onChange: (value: ReportFilterValue) => void
}) {
  const options = useClientFilterOptions()
  const hasActiveFilters = Object.values(value).some((v) => v !== "")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReportFilterFields value={value} onChange={onChange} options={options} />
      {hasActiveFilters && (
        <button
          onClick={() => onChange(EMPTY_REPORT_FILTERS)}
          className="text-xs text-zinc-500 hover:text-white transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

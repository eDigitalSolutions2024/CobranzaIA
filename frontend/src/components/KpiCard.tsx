import type { LucideIcon } from "lucide-react"

type Props = {
  title: string
  value: string | number
  change?: string
  icon?: LucideIcon 
  colorIcon?: string
  size?: number
  // Texto pequeño bajo el título (ej. el periodo que cubre la tarjeta)
  subtitle?: string
  // Si se pasa, la tarjeta es un botón (ej. abrir Calls ya filtrado)
  onClick?: () => void

}

export default function KpiCard({

  title,
  value,
  change,
  colorIcon,
  icon: Icon,
  size,
  subtitle,
  onClick

}: Props) {

  function formatValue() {

    if (

      typeof value ===
      "number"

    ) {

      return value.toLocaleString(
        "en-US"
      )

    }

    return value

  }

  return (
    
    <div
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`
        rounded-2xl
        border
        border-[var(--border)]
        bg-[var(--bg-main)]
        p-6
        ${onClick ? "cursor-pointer transition-colors hover:border-zinc-500" : ""}
      `}
    >
      <h2
        className="
          text-2xl
          text-white
          font-bold
        "
      >

        {

          title

        }

      </h2>

      {subtitle && <p className="mt-1 text-sm text-amber-400">{subtitle}</p>}

      <div
        className="
          mt-4
          flex
          items-end
          justify-between
        "
      >

        <h2
          className="
            text-3xl
            font-bold
          "
        >
          

          {

            formatValue()

          }

        </h2>

        {

          change && (
            

            <span
              className="
                rounded-full
                bg-emerald-500/10
                px-3
                py-1
                text-sm
                text-emerald-400
              "
            >

              {

                change

              }

            </span>

          )
          

        }
        <span>
        {
          Icon && <Icon color={colorIcon} size={size} />
        }
      </span>

      </div>

    </div>

  )

}
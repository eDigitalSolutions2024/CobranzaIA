import type { LucideIcon } from "lucide-react"

type Props = {
  title: string
  value: string | number
  change?: string
  icon?: LucideIcon 
  colorIcon?: string
  size?: number

}

export default function KpiCard({

  title,
  value,
  change,
  colorIcon,
  icon: Icon,
  size

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
      className="
        rounded-2xl
        border
        border-[var(--border)]
        bg-[var(--bg-main)]
        p-6
      "
    >
      <p
        className="
          text-sm
          text-white
        "
      >

        {

          title

        }

      </p>
      
      
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
type Props = {

  title: string

  value: string | number

  change?: string

}

export default function KpiCard({

  title,

  value,

  change,

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
        border-zinc-800
        bg-zinc-900/50
        p-6
      "
    >

      <p
        className="
          text-sm
          text-zinc-400
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

      </div>

    </div>

  )

}
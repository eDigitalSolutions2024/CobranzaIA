import {
  useEffect,
  useState,
} from "react"

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  Tooltip,
} from "recharts"

export default function RecoveryChart() {

  const [
    data,
    setData,
  ] = useState<any[]>([])

  useEffect(() => {

    load()

  }, [])

  async function load() {

    try {

      const response =

        await fetch(
          "http://localhost:3002/api/clients"
        )

      const clients =

        await response.json()

      const grouped =
        clients.reduce(

          (
            acc:any,
            client:any
          ) => {

            const day =

              new Date(
                client.createdAt
              )

              .toLocaleDateString(
                "en-US",
                {

                  weekday:
                    "short",

                }

              )

            if (
              !acc[day]
            ) {

              acc[day] =
                0

            }

            acc[day] +=
              Number(
                client.debt
              )

            return acc

          },

          {}

        )

      const chart =

        Object.entries(
          grouped
        )

        .map(

          (
            [
              day,
              total,
            ]
          ) => ({

            day,

            total,

          })

        )

      setData(
        chart
      )

    }

    catch (
      error
    ) {

      console.log(
        error
      )

    }

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

      <div
        className="
          mb-6
        "
      >

        <h2
          className="
            text-lg
            font-semibold
          "
        >

          Weekly recovery

        </h2>

        <p
          className="
            text-sm
            text-zinc-400
          "
        >

          Collections recorded

        </p>

      </div>

      <div
        className="
          h-80
        "
      >

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <LineChart
            data={
              data
            }
          >

            <XAxis
              dataKey="day"
              stroke="#71717a"
            />

            <Tooltip

              formatter={

                (
                  value
                ) =>

                  [

                    `$${Number(
                      value
                    ).toLocaleString(
                      "en-US"
                    )}`,

                    "Collections",

                  ]

              }

            />

            <Line

              type="monotone"

              dataKey="total"

              stroke="#3b82f6"

              strokeWidth={3}

            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    </div>

  )

}
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

import { getClients } from "../services/clients"

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

      const clients =

        await getClients()

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
        border-[var(--border)]
        bg-[var(--bg-main)]
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
            text-white
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
              stroke="#ffffff"
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
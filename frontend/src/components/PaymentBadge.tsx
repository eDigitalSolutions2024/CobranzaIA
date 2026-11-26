import { paymentTitle } from "./paymentStatus"

// Etiqueta verde junto al nombre del cliente, como "Needs agent" pero para quien ya registró un pago este mes
export default function PaymentBadge({ client }: { client: any }) {
  return (
    <span
      title={paymentTitle(client)}
      className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400 whitespace-nowrap"
    >
      Payment registered
    </span>
  )
}

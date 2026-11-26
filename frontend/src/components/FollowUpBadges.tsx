const ESCALATION_LABEL: Record<string, string> = {
  dispute: "dispute",
  customer_request: "customer asked for an agent",
  followup_unresolved: "follow up not resolved",
}

// Marcas del historial de una llamada: qué intento del seguimiento fue y si pasó a un gestor (y por qué)
export default function FollowUpBadges({ call }: { call: any }) {
  return (
    <>
      {call.followUpAttempt && (
        <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 whitespace-nowrap">
          Follow up · attempt {call.followUpAttempt}
        </span>
      )}
      {call.escalationReason && (
        <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-400 whitespace-nowrap">
          Sent to collector: {ESCALATION_LABEL[call.escalationReason] ?? call.escalationReason}
        </span>
      )}
    </>
  )
}

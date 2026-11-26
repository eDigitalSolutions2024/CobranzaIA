// El cliente registró algo de pago (promesa, en proceso, reportado o domiciliado) y está excluido de las llamadas
// automáticas hasta fin de mes (ver backend/src/services/paymentExclusion.service.ts)
export function hasRegisteredPayment(client: any): boolean {
  return Boolean(client?.collectionExcludedUntil) && new Date(client.collectionExcludedUntil) > new Date()
}

export function paymentTitle(client: any): string {
  return `${client.collectionExclusionReason ?? "Pago registrado"} — sin llamadas automáticas hasta el ${new Date(
    client.collectionExcludedUntil
  ).toLocaleDateString("en-US")}`
}

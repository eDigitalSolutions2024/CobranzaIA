// Manual scenario runner for whatsappFlow.service.ts — exercises every branch
// of the diagram WITHOUT calling the real Meta API. Run with:
//   npx ts-node --transpile-only src/scripts/test-whatsapp-flow.ts
import 'dotenv/config'
import { advanceWhatsappFlow, FlowClient, FlowContext, FlowState } from '../services/whatsappFlow.service'

const client: FlowClient = {
  _id: 'test' as any,
  name: 'Cliente Prueba',
  debt: 4500,
  phone: '5215500000001',
}

async function run(label: string, turns: string[]) {
  console.log(`\n=== ${label} ===`)
  let state: FlowState | null = null
  let context: FlowContext = {}
  for (const text of turns) {
    const result = await advanceWhatsappFlow(text, client, state, context)
    console.log(`> cliente: ${text}`)
    console.log(`< bot (${result.newState}): ${result.reply}`)
    if (result.outcome) console.log(`  outcome:`, result.outcome)
    if (result.createPromise) console.log(`  createPromise:`, result.createPromise)
    state = result.newState
    context = result.newContext
  }
}

// Simula un cliente que escribe DESPUÉS de que el guion ya había cerrado.
async function runReentry(label: string, text: string) {
  console.log(`\n=== ${label} ===`)
  const result = await advanceWhatsappFlow(text, client, 'closed', { checkingReentry: true })
  console.log(`> cliente: ${text}`)
  console.log(`< bot (${result.newState}): ${result.reply || '(sin respuesta — se queda cerrado)'}`)
  if (result.outcome) console.log(`  outcome:`, result.outcome)
}

async function main() {
  await run('Identidad — número equivocado', ['No, se equivocó de número'])

  await run('Factura no recibida → ofrece reenvío', [
    'Sí, hablo yo',
    'No, aún no las he recibido',
    'Sí, por favor reenvíela',
  ])

  await run('Factura: "no sé" → pivotea a fecha de pago → promesa → doble confirmación', [
    'Sí, hablo yo',
    'No sé',
    'El 15 de agosto le pago los $4,500',
    'Sí, es correcto',
    'Sí, así es',
  ])

  await run('Factura: respuesta ambigua ("creo que sí")', [
    'Sí, hablo yo',
    'Creo que sí',
    'Sí ya la recibí',
  ])

  await run('Ya pagó (reported_payment)', ['Sí', 'Sí', 'Ya pagamos', 'El lunes pasado'])
  await run('Domiciliado', ['Sí', 'Sí', 'Está domiciliado', 'No tiene fecha específica'])
  await run('Sin fecha, sin problema (no_payment_capacity)', ['Sí', 'Sí', 'No tengo fecha', 'Tal vez el próximo mes'])
  await run('No puede pagar ahora (no_payment_capacity)', ['Sí', 'Sí', 'No puedo pagar en este momento', 'Quizá en un mes'])
  await run('Ambiguo en fecha de pago → clarifica → escala', ['Sí', 'Sí', 'Creo que sí', 'Tal vez'])
  await run('Déjame revisarlo (callback_later)', ['Sí', 'Sí', 'Déjame revisarlo', 'El viernes en la tarde'])
  await run('Monto incorrecto (dispute_amount)', ['Sí', 'Sí', 'El monto no es correcto', 'Yo creo que son $3,000'])
  await run('Factura incorrecta (dispute_invoice → humano)', ['Sí', 'Sí', 'La factura está incorrecta', 'Cobraron dos veces el mismo cargo'])
  await run('Lo ve otra persona', ['Sí', 'Sí', 'Eso lo ve mi contador', 'Se llama Pedro'])
  await run('Manda la factura', ['Sí', 'Sí', 'Mándame la factura', 'Sí, por aquí mismo'])
  await run('Quiere hablar con persona', ['Sí', 'Sí', 'Quiero hablar con un asesor'])

  await run('Promesa con corrección en step 4 y en step 5', [
    'Sí',
    'Sí',
    'Le pago el viernes $4,500',
    'No, mejor el 20 de agosto',
    'Sí, así es',
    'No, mejor $5,000',
    'Sí, correcto',
  ])

  await runReentry('Reentrada: solo agradecimiento → se queda cerrado', 'Gracias, de acuerdo')
  await runReentry('Reentrada: ok simple → se queda cerrado', 'ok')
  await runReentry('Reentrada: trae info nueva → reabre con promesa', 'Al final sí le puedo pagar el 20 de agosto $4,500')
  await runReentry('Reentrada: pide la factura → reabre con resend_invoice', 'Oigan no me ha llegado la factura, me la pueden mandar?')

  await run('Pregunta totalmente ajena al guion (debe redirigir, nunca contestarla)', [
    'Sí',
    'Sí',
    'Ayúdame a resolver una ecuación 2x + 4 = 12',
  ])

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

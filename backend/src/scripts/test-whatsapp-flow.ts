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

async function main() {
  await run('Identidad — número equivocado', ['No, se equivocó de número'])
  await run('Factura no recibida → fecha+monto → confirmación', [
    'Sí, hablo yo',
    'No, aún no las he recibido',
    'El 15 de agosto le pago los $4,500',
    'Sí, es correcto',
  ])
  await run('Ya pagó (reported_payment)', ['Sí', 'Sí', 'Ya pagamos', 'El lunes pasado'])
  await run('Domiciliado', ['Sí', 'Sí', 'Está domiciliado', 'No tiene fecha específica'])
  await run('Ambiguo → clarifica → escala', ['Sí', 'Sí', 'No sé', 'Tal vez'])
  await run('Déjame revisarlo (callback_later)', ['Sí', 'Sí', 'Déjame revisarlo', 'El viernes en la tarde'])
  await run('No puede pagar ahora', ['Sí', 'Sí', 'No puedo pagar en este momento', 'Quizá en un mes'])
  await run('Monto incorrecto (dispute)', ['Sí', 'Sí', 'El monto no es correcto', 'Yo creo que son $3,000'])
  await run('Lo ve otra persona', ['Sí', 'Sí', 'Eso lo ve mi contador', 'Se llama Pedro'])
  await run('Manda la factura', ['Sí', 'Sí', 'Mándame la factura', 'Sí, por aquí mismo'])
  await run('Quiere hablar con persona', ['Sí', 'Sí', 'Quiero hablar con un asesor'])
  await run('Promesa con corrección en confirmación', [
    'Sí',
    'Sí',
    'Le pago el viernes $4,500',
    'No, mejor el 20 de agosto',
    'Sí, así es',
  ])

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

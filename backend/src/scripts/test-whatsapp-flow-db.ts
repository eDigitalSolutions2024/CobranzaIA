// Verifies the DB-writing side of the flow (Conversation.flowState/flowOutcome,
// PaymentPromise creation) against the real schema — without calling Meta.
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../db'
import Client from '../models/Client'
import Conversation from '../models/Conversation'
import PaymentPromise from '../models/PaymentPromise'
import { advanceWhatsappFlow, FlowClient, FlowContext, FlowState } from '../services/whatsappFlow.service'

async function main() {
  await connectDB()

  const client = await Client.findOne({ phone: '5215500000001' })
  if (!client) throw new Error('Cliente de prueba no encontrado — créalo primero vía POST /api/clients')

  const conversation = await Conversation.findOneAndUpdate(
    { phone: client.phone },
    { $setOnInsert: { phone: client.phone, clientId: client._id, status: 'active' } },
    { upsert: true, new: true }
  )

  const flowClient: FlowClient = {
    _id: client._id as mongoose.Types.ObjectId,
    name: client.name as string,
    debt: client.debt as number,
    phone: client.phone as string,
  }

  let state: FlowState | null = null
  let context: FlowContext = {}
  const turns = ['Sí', 'Sí', 'El 15 de agosto le pago los $4,500', 'Sí, es correcto']

  for (const text of turns) {
    const result = await advanceWhatsappFlow(text, flowClient, state, context)
    console.log(`> ${text}`)
    console.log(`< (${result.newState}) ${result.reply}`)

    const update: Record<string, unknown> = { flowState: result.newState, flowContext: result.newContext }
    if (result.outcome) {
      update.flowOutcome = { ...result.outcome, updatedAt: new Date() }
      if (result.outcome.type !== 'payment_promise') update.requiresFollowUp = true
    }
    await Conversation.findByIdAndUpdate(conversation._id, update)

    if (result.createPromise) {
      await PaymentPromise.create({
        clientId: client._id,
        amount: result.createPromise.amount,
        promisedDate: result.createPromise.date,
        status: 'pending',
        notes: 'Registrado vía flujo automatizado de WhatsApp (llamada preventiva) — TEST',
        detectedByAI: true,
      })
      client.status = 'promised'
      await client.save()
    }

    state = result.newState
    context = result.newContext
  }

  const finalConversation = await Conversation.findById(conversation._id).lean()
  const finalPromise = await PaymentPromise.findOne({ clientId: client._id }).sort({ createdAt: -1 }).lean()
  const finalClient = await Client.findById(client._id).lean()

  console.log('\n--- Conversation ---')
  console.log(JSON.stringify(finalConversation, null, 2))
  console.log('\n--- PaymentPromise ---')
  console.log(JSON.stringify(finalPromise, null, 2))
  console.log('\n--- Client.status ---', (finalClient as any)?.status)

  await mongoose.connection.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

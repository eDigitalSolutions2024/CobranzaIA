// Migración de una sola vez para el fix de multi-moneda (USD/PEN/COP/CLP... -> MXN).
// Correr UNA VEZ en cada entorno (local y producción) después de desplegar el nuevo
// código: `npx ts-node src/scripts/migrateCurrency.ts`.
//
// Qué hace:
// 1. Si existe el documento viejo de ExchangeRate (formato { usdMxn: N }, sin
//    currencyCode), lo convierte al nuevo formato { currencyCode: 'USD', rateToMxn: N }
//    — para no perder la tasa que ya se había capturado a mano.
// 2. Recalcula amountMxn/remainingAmountMxn de TODAS las facturas existentes con las
//    tasas ya migradas (antes de este fix, esos campos no existían).
// 3. Vuelve a correr syncClientFromInvoices para cada cliente con facturas, para que
//    Client.debt quede en pesos de verdad (antes sumaba montos crudos sin convertir).
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Invoice from '../models/Invoice'
import Client from '../models/Client'
import ExchangeRate from '../models/ExchangeRate'
import { loadExchangeRates, toMxn } from '../utils/currency'

dotenv.config()

async function migrateOldRateDoc(): Promise<void> {
  const raw = await mongoose.connection.db!.collection('exchangerates').findOne({ usdMxn: { $exists: true } })
  if (!raw) {
    console.log('[migrateCurrency] No hay documento viejo de ExchangeRate (usdMxn) que migrar.')
    return
  }
  const existingUsd = await ExchangeRate.findOne({ currencyCode: 'USD' })
  if (!existingUsd) {
    await ExchangeRate.create({ currencyCode: 'USD', rateToMxn: raw.usdMxn, updatedBy: raw.updatedBy ?? null })
    console.log(`[migrateCurrency] Migrada tasa vieja usdMxn=${raw.usdMxn} -> ExchangeRate{currencyCode:'USD'}.`)
  } else {
    console.log(`[migrateCurrency] Ya existe una tasa USD (${existingUsd.rateToMxn}) en el formato nuevo.`)
  }
  // El doc viejo no tiene currencyCode (schema anterior) — si se deja, ExchangeRate.find()
  // lo trae de vuelta con currencyCode:undefined y ensucia el mapa de tasas.
  await mongoose.connection.db!.collection('exchangerates').deleteOne({ _id: raw._id })
  console.log('[migrateCurrency] Documento viejo de ExchangeRate eliminado.')
}

async function backfillInvoices(): Promise<void> {
  const rates = await loadExchangeRates()
  console.log('[migrateCurrency] Tasas cargadas:', Object.fromEntries(rates))

  const invoices = await Invoice.find()
  let updated = 0
  const unrated = new Set<string>()

  for (const inv of invoices) {
    const amountMxn = toMxn(inv.amount as number, inv.currencyCode as string | null, rates)
    if (amountMxn === null) unrated.add((inv.currencyCode as string) || 'MXN')

    const remainingAmountMxn =
      inv.remainingAmount != null ? toMxn(inv.remainingAmount as number, 'USD', rates) : null
    if (inv.remainingAmount != null && remainingAmountMxn === null) unrated.add('USD')

    inv.set('amountMxn', amountMxn)
    inv.set('remainingAmountMxn', remainingAmountMxn)
    await inv.save()
    updated++
  }

  console.log(`[migrateCurrency] ${updated} facturas actualizadas con amountMxn/remainingAmountMxn.`)
  if (unrated.size > 0) {
    console.log(
      `[migrateCurrency] AVISO: sin tasa configurada para: ${[...unrated].join(', ')} — esas facturas quedaron con amountMxn/remainingAmountMxn en null (no cuentan en Client.debt hasta que se agregue su tasa y se vuelva a correr este script).`
    )
  }
}

// Misma lógica que syncClientFromInvoices en invoiceController.ts — duplicada aquí (no
// importada) porque ese archivo trae tipos de Express/Multer que ts-node no resuelve
// bien al compilar un script suelto fuera de la app. Si esa función cambia, replicar el
// cambio aquí también.
async function resyncClients(): Promise<void> {
  const clientIds = await Invoice.distinct('clientId')
  console.log(`[migrateCurrency] Recalculando debt/usdAmount de ${clientIds.length} clientes con facturas...`)
  const rates = await loadExchangeRates()
  const usdRate = rates.get('USD')

  for (const clientId of clientIds) {
    const [result] = await Invoice.aggregate([
      { $match: { clientId, status: { $ne: 'cancelled' } } },
      { $sort: { issueDate: -1 } },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$remainingAmountMxn', { $ifNull: ['$amountMxn', 0] }] } },
          collector: { $first: '$collector' },
          teamLeader: { $first: '$teamLeader' },
          agingTarget: { $first: '$agingTarget' },
        },
      },
    ])
    const debt = result?.total ?? 0
    const usdAmount = usdRate ? Math.round((debt / usdRate) * 100) / 100 : null
    await Client.findByIdAndUpdate(clientId, {
      debt,
      usdAmount,
      collector: result?.collector ?? null,
      teamLeader: result?.teamLeader ?? null,
      agingTarget: result?.agingTarget ?? null,
    })
  }
  console.log('[migrateCurrency] Client.debt/usdAmount recalculado para todos.')
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string)
  await migrateOldRateDoc()
  await backfillInvoices()
  await resyncClients()
  await mongoose.disconnect()
  console.log('[migrateCurrency] Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

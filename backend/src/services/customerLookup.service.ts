import mongoose from 'mongoose'
import Client from '../models/Client'

interface ClientInfo {
  _id: mongoose.Types.ObjectId
  name: string
  debt: number
  status: string
  phone: string
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

function toClientInfo(c: Record<string, unknown>): ClientInfo {
  return {
    _id: c._id as mongoose.Types.ObjectId,
    name: c.name as string,
    debt: (c.debt as number) ?? 0,
    status: c.status as string,
    phone: c.phone as string,
  }
}

export async function findClientByPhone(rawPhone: string): Promise<ClientInfo | null> {
  const exact = await Client.findOne({ phone: rawPhone }).lean()
  if (exact) return toClientInfo(exact as Record<string, unknown>)

  // Use a suffix regex so MongoDB can use the phone index (anchored at end)
  const normalized = normalizePhone(rawPhone)
  const byRegex = await Client.findOne({
    phone: { $regex: `${normalized}$` },
  }).lean()

  return byRegex ? toClientInfo(byRegex as Record<string, unknown>) : null
}

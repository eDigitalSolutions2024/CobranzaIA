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
  // Keep only digits, take last 10
  return phone.replace(/\D/g, '').slice(-10)
}

export async function findClientByPhone(rawPhone: string): Promise<ClientInfo | null> {
  // Try exact match first
  const exact = await Client.findOne({ phone: rawPhone }).lean()
  if (exact) {
    return {
      _id: exact._id as mongoose.Types.ObjectId,
      name: exact.name as string,
      debt: (exact.debt as number) ?? 0,
      status: exact.status as string,
      phone: exact.phone as string,
    }
  }

  // Try matching by last 10 digits
  const normalized = normalizePhone(rawPhone)
  const all = await Client.find({}).lean()
  const match = all.find((c) => normalizePhone(c.phone as string) === normalized)

  if (!match) return null

  return {
    _id: match._id as mongoose.Types.ObjectId,
    name: match.name as string,
    debt: (match.debt as number) ?? 0,
    status: match.status as string,
    phone: match.phone as string,
  }
}

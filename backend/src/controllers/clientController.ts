import { Request, Response } from "express"
import Client from "../models/Client"
import PaymentPromise from "../models/PaymentPromise"
import Call from "../models/Call"

export async function getClients(req: Request, res: Response) {
  try {
    const clients = await Client.find().sort({ createdAt: -1 })
    res.json(clients)
  } catch (error) {
    console.log("Error getClients:", error)
    res.status(500).json({ message: "Error obteniendo clientes" })
  }
}

export async function getClientDetail(req: Request, res: Response) {
  try {
    const { id } = req.params
    const [client, promises, calls] = await Promise.all([
      Client.findById(id).lean(),
      PaymentPromise.find({ clientId: id }).sort({ promisedDate: 1 }).lean(),
      Call.find({ clientId: id }).sort({ createdAt: -1 }).lean(),
    ])
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" })
    res.json({ client, promises, calls })
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo detalle del cliente" })
  }
}

export async function createClient(req: Request, res: Response) {
  try {
    const client = await Client.create(req.body)
    res.status(201).json(client)
  } catch (error: any) {
    console.log("Error createClient:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe un cliente con ese número de teléfono",
      })
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Error creando cliente" })
  }
}

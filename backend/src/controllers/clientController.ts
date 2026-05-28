import { Request, Response } from "express"
import Client from "../models/Client"

export async function getClients(req: Request, res: Response) {
  try {
    const clients = await Client.find().sort({ createdAt: -1 })
    res.json(clients)
  } catch (error) {
    console.log("Error getClients:", error)
    res.status(500).json({ message: "Error obteniendo clientes" })
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

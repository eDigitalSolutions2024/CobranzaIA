import { Request, Response } from "express"
import Invoice from "../models/Invoice"

export async function createInvoice(req: Request, res: Response) {
  try {
    const { id } = req.params
    const invoice = await Invoice.create({ ...req.body, clientId: id })
    res.status(201).json(invoice)
  } catch (error: any) {
    console.log("Error createInvoice:", error)
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: "Error creando factura" })
  }
}

export async function updateInvoice(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params
    const invoice = await Invoice.findByIdAndUpdate(invoiceId, req.body, {
      new: true,
      runValidators: true,
    })
    if (!invoice) return res.status(404).json({ message: "Factura no encontrada" })
    res.json(invoice)
  } catch (error: any) {
    console.log("Error updateInvoice:", error)
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: "Error actualizando factura" })
  }
}

export async function deleteInvoice(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params
    const invoice = await Invoice.findByIdAndDelete(invoiceId)
    if (!invoice) return res.status(404).json({ message: "Factura no encontrada" })
    res.json({ message: "Factura eliminada" })
  } catch (error) {
    console.error("Error deleteInvoice:", error)
    res.status(500).json({ message: "Error eliminando factura" })
  }
}

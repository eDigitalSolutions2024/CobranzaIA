import { Request, Response } from "express"
import ExcelJS from "exceljs"
import mongoose from "mongoose"
import Invoice from "../models/Invoice"
import Client from "../models/Client"

// El saldo del cliente (`Client.debt`) no se captura a mano — es la suma de sus
// facturas. Collector/TeamLeader/Aging tampoco se editan a mano en el cliente:
// se toman de su factura más reciente (issueDate), asumiendo que son fijos por
// cuenta (el mismo cobrador/equipo atiende todas las facturas de un cliente).
// Las fechas (Create/Due) NO se sincronizan a nivel cliente a propósito —
// varían por factura y ya se ven en la pestaña Invoices de cada una.
// Se recalcula cada vez que una factura se crea, edita, borra o importa.
async function syncClientFromInvoices(clientId: mongoose.Types.ObjectId | string): Promise<void> {
  const [result] = await Invoice.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $ne: "cancelled" } } },
    { $sort: { issueDate: -1 } },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$remainingAmount", "$amount"] } },
        collector: { $first: "$collector" },
        teamLeader: { $first: "$teamLeader" },
        agingTarget: { $first: "$agingTarget" },
      },
    },
  ])
  await Client.findByIdAndUpdate(clientId, {
    debt: result?.total ?? 0,
    collector: result?.collector ?? null,
    teamLeader: result?.teamLeader ?? null,
    agingTarget: result?.agingTarget ?? null,
  })
}

export async function createInvoice(req: Request, res: Response) {
  try {
    const { id } = req.params
    const invoice = await Invoice.create({ ...req.body, clientId: id })
    await syncClientFromInvoices(String(id))
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
    await syncClientFromInvoices(invoice.clientId as mongoose.Types.ObjectId)
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
    await syncClientFromInvoices(invoice.clientId as mongoose.Types.ObjectId)
    res.json({ message: "Factura eliminada" })
  } catch (error) {
    console.error("Error deleteInvoice:", error)
    res.status(500).json({ message: "Error eliminando factura" })
  }
}

// ── Importación masiva desde Excel ──────────────────────────────────────────
// Una hoja de facturas (muchas filas por cliente), relacionada por Customer ID
// contra el campo `customerId` que ya existe en Client. Reimportar el mismo
// Invoice Number actualiza la factura existente en vez de duplicarla.

const HEADER_ALIASES: Record<string, string[]> = {
  customerId: ["customer id", "customerid", "id cliente"],
  invoiceNumber: ["invoice number", "invoice", "numero de factura"],
  hptfInvoiceNumber: ["hptf invoice number", "hptf invoice"],
  contractNumber: ["contract number", "numero de contrato"],
  invoiceType: ["invoice type", "tipo de factura"],
  issueDate: ["invoice create date", "create date", "fecha de creacion"],
  dueDate: ["payment due date", "due date", "fecha de vencimiento"],
  amount: ["invoice amount due", "invoice amount", "amount", "monto de factura"],
  remainingAmount: ["usd remaining amount due", "remaining amount due", "remaining amount"],
  agingTarget: ["aging target", "aging"],
  collector: ["collector", "cobrador"],
  teamLeader: ["tl", "team leader", "teamleader"],
  currencyCode: ["currency code", "moneda"],
  customerCountry: ["customer country", "pais del cliente"],
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toDateOrNull(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function toStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  return s === "" ? null : s
}

const HEADER_TO_FIELD: Record<string, string> = {}
for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
  for (const alias of aliases) HEADER_TO_FIELD[normalizeHeader(alias)] = field
}

export async function importInvoices(req: Request, res: Response) {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" })
    }

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return res.status(400).json({ message: "El archivo no contiene hojas" })
    }

    // El encabezado no siempre está en la fila 1 (algunos exports traen una fila
    // en blanco o un título arriba) — se busca entre las primeras filas la que
    // contenga tanto Customer ID como Invoice Number.
    let headerRowNumber = 0
    let colByField: Record<string, number> = {}
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const candidate: Record<string, number> = {}
      sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const field = HEADER_TO_FIELD[normalizeHeader(cell.value)]
        if (field) candidate[field] = colNumber
      })
      if (candidate.customerId && candidate.invoiceNumber) {
        headerRowNumber = r
        colByField = candidate
        break
      }
    }

    if (!headerRowNumber) {
      return res.status(400).json({
        message: "El archivo debe tener columnas de Customer ID e Invoice Number",
      })
    }

    type ParsedRow = {
      rowNumber: number
      customerId: number
      invoiceNumber: string
      hptfInvoiceNumber: string | null
      contractNumber: string | null
      invoiceType: string | null
      issueDate: Date | null
      dueDate: Date | null
      amount: number
      remainingAmount: number | null
      agingTarget: string | null
      collector: string | null
      teamLeader: string | null
      currencyCode: string | null
      customerCountry: string | null
    }

    const rows: ParsedRow[] = []
    const rowErrors: { row: number; message: string }[] = []

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return

      const cellValue = (field: string) =>
        colByField[field] ? row.getCell(colByField[field]).value : undefined

      const customerId = toNumberOrNull(cellValue("customerId"))
      const invoiceNumber = toStringOrNull(cellValue("invoiceNumber"))

      if (!customerId || !invoiceNumber) {
        rowErrors.push({ row: rowNumber, message: "Falta Customer ID o Invoice Number" })
        return
      }

      rows.push({
        rowNumber,
        customerId,
        invoiceNumber,
        hptfInvoiceNumber: toStringOrNull(cellValue("hptfInvoiceNumber")),
        contractNumber: toStringOrNull(cellValue("contractNumber")),
        invoiceType: toStringOrNull(cellValue("invoiceType")),
        issueDate: toDateOrNull(cellValue("issueDate")),
        dueDate: toDateOrNull(cellValue("dueDate")),
        amount: toNumberOrNull(cellValue("amount")) ?? 0,
        remainingAmount: toNumberOrNull(cellValue("remainingAmount")),
        agingTarget: toStringOrNull(cellValue("agingTarget")),
        collector: toStringOrNull(cellValue("collector")),
        teamLeader: toStringOrNull(cellValue("teamLeader")),
        currencyCode: toStringOrNull(cellValue("currencyCode")),
        customerCountry: toStringOrNull(cellValue("customerCountry")),
      })
    })

    if (rows.length === 0) {
      return res.status(400).json({
        message: "El archivo no tiene filas válidas para importar",
        errors: rowErrors,
      })
    }

    const customerIds = [...new Set(rows.map((r) => r.customerId))]
    const clients = await Client.find({ customerId: { $in: customerIds } })
      .select("customerId")
      .lean()
    const clientIdByCustomerId = new Map(clients.map((c) => [c.customerId as number, c._id]))

    const skipped: { row: number; invoiceNumber: string; reason: string }[] = []
    const ops: any[] = []

    for (const row of rows) {
      const clientId = clientIdByCustomerId.get(row.customerId)
      if (!clientId) {
        skipped.push({
          row: row.rowNumber,
          invoiceNumber: row.invoiceNumber,
          reason: `No se encontró un cliente con Customer ID ${row.customerId}`,
        })
        continue
      }

      ops.push({
        updateOne: {
          filter: { invoiceNumber: row.invoiceNumber },
          update: {
            $set: {
              clientId,
              invoiceNumber: row.invoiceNumber,
              hptfInvoiceNumber: row.hptfInvoiceNumber,
              contractNumber: row.contractNumber,
              invoiceType: row.invoiceType,
              amount: row.amount,
              remainingAmount: row.remainingAmount,
              agingTarget: row.agingTarget,
              collector: row.collector,
              teamLeader: row.teamLeader,
              currencyCode: row.currencyCode,
              customerCountry: row.customerCountry,
              issueDate: row.issueDate,
              dueDate: row.dueDate,
            },
          },
          upsert: true,
        },
      })
    }

    let upsertedCount = 0
    let modifiedCount = 0
    if (ops.length > 0) {
      const result = await Invoice.bulkWrite(ops, { ordered: false })
      upsertedCount = result.upsertedCount ?? 0
      modifiedCount = result.modifiedCount ?? 0

      const touchedClientIds = [...new Set(ops.map((op) => String(op.updateOne.update.$set.clientId)))]
      await Promise.all(touchedClientIds.map((clientId) => syncClientFromInvoices(clientId)))
    }

    res.json({
      totalRows: rows.length,
      createdCount: upsertedCount,
      updatedCount: modifiedCount,
      skipped,
      errors: rowErrors,
    })
  } catch (error) {
    console.error("Error importInvoices:", error)
    res.status(500).json({ message: "Error importando facturas desde Excel" })
  }
}

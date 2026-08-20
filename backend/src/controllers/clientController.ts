import { Request, Response } from "express"
import ExcelJS from "exceljs"
import Client from "../models/Client"
import PaymentPromise from "../models/PaymentPromise"
import Call from "../models/Call"
import Invoice from "../models/Invoice"
import { isValidRFC, normalizeRFC } from "../utils/rfc"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  contacted: "Contactado",
  negotiating: "Negociando",
  promised: "Promesa",
  paid: "Pagado",
  no_response: "Sin respuesta",
}

const RISK_LABEL: Record<string, string> = { low: "Bajo", medium: "Medio", high: "Alto" }

const PROMISE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  completed: "Cumplida",
  broken: "Incumplida",
  cancelled: "Cancelada",
}

const CALL_STATUS_LABEL: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completada",
  failed: "Fallida",
  requires_human: "Requiere asesor",
}

const RISK_FROM_LABEL: Record<string, string> = {
  bajo: "low",
  medio: "medium",
  alto: "high",
  low: "low",
  medium: "medium",
  high: "high",
}

const CHANNEL_ALIASES: Record<string, string> = {
  whatsapp: "whatsapp",
  sms: "sms",
  llamada: "llamada",
  call: "llamada",
  telefono: "llamada",
  email: "email",
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["nombre", "name", "cliente", "customername", "customer name"],
  phone: ["telefono", "phone", "celular", "numero"],
  rfc: ["rfc", "tax id", "taxid"],
  debt: ["deuda", "debt", "monto"],
  channel: ["canal", "channel"],
  risk: ["riesgo", "risk", "riesgo ia"],
  notes: ["notas", "notes", "observaciones"],
  country: ["pais", "country"],
  customerId: ["customerid", "customer id", "id cliente", "clienteid"],
  collectorId: ["collectorid", "collector id", "id cobrador"],
  team: ["team", "equipo"],
  teamLeader: ["teamleader", "team leader", "lider de equipo"],
  collector: ["collector", "cobrador"],
  invoiceNumber: ["invoice number", "invoice", "numero de factura", "factura"],
  createDate: ["create date", "fecha de creacion", "fecha creacion"],
  dueDate: ["due date", "fecha de vencimiento", "vencimiento"],
  agingDays: ["aging days", "aging", "dias de mora"],
  loanLease: ["loan/lease", "loan lease", "prestamo/arrendamiento"],
  usdAmount: ["usd amount", "monto usd", "dolares"],
  contact: ["contact", "contacto"],
  nextAction: ["next action", "proxima accion", "siguiente accion"],
  paymentPromiseAmount: ["payment promise", "promesa de pago", "monto promesa"],
  datePromise: ["date promise", "fecha promesa", "fecha de promesa"],
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "")
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

export async function getClients(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
    const skip = (page - 1) * limit

    const [clients, total] = await Promise.all([
      Client.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Client.countDocuments(),
    ])

    res.json({ clients, total, page, pages: Math.ceil(total / limit) })
  } catch (error) {
    console.log("Error getClients:", error)
    res.status(500).json({ message: "Error obteniendo clientes" })
  }
}

export async function getClientDetail(req: Request, res: Response) {
  try {
    const { id } = req.params
    const [client, promises, calls, invoices] = await Promise.all([
      Client.findById(id).lean(),
      PaymentPromise.find({ clientId: id }).sort({ promisedDate: 1 }).lean(),
      Call.find({ clientId: id }).sort({ createdAt: -1 }).lean(),
      Invoice.find({ clientId: id }).sort({ issueDate: -1 }).lean(),
    ])
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" })
    res.json({ client, promises, calls, invoices })
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo detalle del cliente" })
  }
}

export async function updateClient(req: Request, res: Response) {
  try {
    const { id } = req.params
    const client = await Client.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" })
    res.json(client)
  } catch (error: any) {
    console.log("Error updateClient:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe un cliente con ese número de teléfono",
      })
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Error actualizando cliente" })
  }
}

export async function deleteClient(req: Request, res: Response) {
  try {
    const { id } = req.params
    const client = await Client.findByIdAndDelete(id)
    if (!client) return res.status(404).json({ message: "Cliente no encontrado" })
    res.json({ message: "Cliente eliminado" })
  } catch (error) {
    console.error("Error deleteClient:", error)
    res.status(500).json({ message: "Error eliminando cliente" })
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

export async function importClients(req: Request, res: Response) {
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

    const colByField: Record<string, number> = {}
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = HEADER_TO_FIELD[normalizeHeader(cell.value)]
      if (field) colByField[field] = colNumber
    })

    if (!colByField.name || !colByField.phone) {
      return res.status(400).json({
        message: "El archivo debe tener columnas de Nombre y Teléfono (descarga la plantilla)",
      })
    }

    type ParsedRow = {
      rowNumber: number
      name: string
      phone: string
      rfc: string | null
      debt: number
      channel: string
      risk: string
      notes: string | null
      country: string | null
      customerId: number | null
      collectorId: number | null
      team: string | null
      teamLeader: string | null
      collector: string | null
      invoiceNumber: string | null
      createDate: Date | null
      dueDate: Date | null
      agingDays: number | null
      loanLease: string | null
      usdAmount: number | null
      contact: string | null
      nextAction: string | null
      paymentPromiseAmount: number | null
      datePromise: Date | null
    }

    const rows: ParsedRow[] = []
    const rowErrors: { row: number; message: string }[] = []

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return

      const cellValue = (field: string) =>
        colByField[field] ? row.getCell(colByField[field]).value : undefined

      const name = String(cellValue("name") ?? "").trim()
      const phone = normalizePhone(cellValue("phone"))

      if (!name || !phone) {
        rowErrors.push({ row: rowNumber, message: "Falta nombre o teléfono" })
        return
      }

      const rfcRaw = toStringOrNull(cellValue("rfc"))
      let rfc: string | null = null
      if (rfcRaw) {
        if (isValidRFC(rfcRaw)) {
          rfc = normalizeRFC(rfcRaw)
        } else {
          rowErrors.push({ row: rowNumber, message: `RFC "${rfcRaw}" con formato inválido, se importó el cliente sin RFC` })
        }
      }

      const debtRaw = cellValue("debt")
      const debt = debtRaw !== undefined && debtRaw !== null && debtRaw !== "" ? Number(debtRaw) : 0

      const channel = CHANNEL_ALIASES[normalizeHeader(cellValue("channel"))] || "whatsapp"
      const risk = RISK_FROM_LABEL[normalizeHeader(cellValue("risk"))] || "medium"

      const notesRaw = cellValue("notes")
      const notes = notesRaw !== undefined && notesRaw !== null && String(notesRaw).trim() !== ""
        ? String(notesRaw).trim()
        : null

      const loanLeaseRaw = toStringOrNull(cellValue("loanLease"))
      const loanLeaseNormalized = normalizeHeader(loanLeaseRaw)
      const loanLease =
        loanLeaseNormalized === "loan" ? "Loan" : loanLeaseNormalized === "lease" ? "Lease" : null

      rows.push({
        rowNumber,
        name,
        phone,
        rfc,
        debt: Number.isFinite(debt) ? debt : 0,
        channel,
        risk,
        notes,
        country: toStringOrNull(cellValue("country")) || "Mexico",
        customerId: toNumberOrNull(cellValue("customerId")),
        collectorId: toNumberOrNull(cellValue("collectorId")),
        team: toStringOrNull(cellValue("team")),
        teamLeader: toStringOrNull(cellValue("teamLeader")),
        collector: toStringOrNull(cellValue("collector")),
        invoiceNumber: toStringOrNull(cellValue("invoiceNumber")),
        createDate: toDateOrNull(cellValue("createDate")),
        dueDate: toDateOrNull(cellValue("dueDate")),
        agingDays: toNumberOrNull(cellValue("agingDays")),
        loanLease,
        usdAmount: toNumberOrNull(cellValue("usdAmount")),
        contact: toStringOrNull(cellValue("contact")),
        nextAction: toStringOrNull(cellValue("nextAction")),
        paymentPromiseAmount: toNumberOrNull(cellValue("paymentPromiseAmount")),
        datePromise: toDateOrNull(cellValue("datePromise")),
      })
    })

    if (rows.length === 0) {
      return res.status(400).json({
        message: "El archivo no tiene filas válidas para importar",
        errors: rowErrors,
      })
    }

    const existing = await Client.find({ phone: { $in: rows.map((r) => r.phone) } })
      .select("phone")
      .lean()
    const existingPhones = new Set(existing.map((c) => c.phone))

    const skipped: { row: number; phone: string; reason: string }[] = []
    const toInsert: ParsedRow[] = []
    const seenInFile = new Set<string>()

    for (const row of rows) {
      if (existingPhones.has(row.phone)) {
        skipped.push({ row: row.rowNumber, phone: row.phone, reason: "Ya existe un cliente con ese teléfono" })
        continue
      }
      if (seenInFile.has(row.phone)) {
        skipped.push({ row: row.rowNumber, phone: row.phone, reason: "Teléfono duplicado dentro del archivo" })
        continue
      }
      seenInFile.add(row.phone)
      toInsert.push(row)
    }

    let created: unknown[] = []
    if (toInsert.length > 0) {
      created = await Client.insertMany(
        toInsert.map((r) => ({
          name: r.name,
          phone: r.phone,
          rfc: r.rfc,
          debt: r.debt,
          channel: r.channel,
          risk: r.risk,
          notes: r.notes,
          country: r.country,
          customerId: r.customerId,
          collectorId: r.collectorId,
          team: r.team,
          teamLeader: r.teamLeader,
          collector: r.collector,
          invoiceNumber: r.invoiceNumber,
          createDate: r.createDate,
          dueDate: r.dueDate,
          agingDays: r.agingDays,
          loanLease: r.loanLease,
          usdAmount: r.usdAmount,
          contact: r.contact,
          nextAction: r.nextAction,
          paymentPromiseAmount: r.paymentPromiseAmount,
          datePromise: r.datePromise,
        })),
        { ordered: false }
      )
    }

    res.json({
      createdCount: created.length,
      totalRows: rows.length,
      skipped,
      errors: rowErrors,
    })
  } catch (error) {
    console.error("Error importClients:", error)
    res.status(500).json({ message: "Error importando clientes desde Excel" })
  }
}

export async function exportClients(req: Request, res: Response) {
  try {
    const [clients, promises, calls] = await Promise.all([
      Client.find().sort({ createdAt: -1 }).lean(),
      PaymentPromise.find().sort({ promisedDate: 1 }).lean(),
      Call.find().sort({ createdAt: -1 }).lean(),
    ])

    const clientById = new Map(clients.map((c) => [String(c._id), c]))

    const workbook = new ExcelJS.Workbook()

    const clientSheet = workbook.addWorksheet("Clientes")
    clientSheet.columns = [
      { header: "Country", key: "country", width: 12 },
      { header: "CustomerID", key: "customerId", width: 12 },
      { header: "CustomerName", key: "name", width: 25 },
      { header: "Teléfono", key: "phone", width: 15 },
      { header: "RFC", key: "rfc", width: 16 },
      { header: "CollectorID", key: "collectorId", width: 12 },
      { header: "Team", key: "team", width: 14 },
      { header: "TeamLeader", key: "teamLeader", width: 16 },
      { header: "Collector", key: "collector", width: 16 },
      { header: "Invoice Number", key: "invoiceNumber", width: 16 },
      { header: "Create Date", key: "createDate", width: 16 },
      { header: "Due Date", key: "dueDate", width: 16 },
      { header: "Aging Days", key: "agingDays", width: 12 },
      { header: "Loan/Lease", key: "loanLease", width: 12 },
      { header: "Deuda", key: "debt", width: 12 },
      { header: "USD Amount", key: "usdAmount", width: 14 },
      { header: "Estado", key: "status", width: 15 },
      { header: "Riesgo IA", key: "risk", width: 12 },
      { header: "Canal", key: "channel", width: 12 },
      { header: "Contact", key: "contact", width: 18 },
      { header: "Último contacto", key: "lastContactAt", width: 18 },
      { header: "Next Action", key: "nextAction", width: 18 },
      { header: "Payment Promise", key: "paymentPromiseAmount", width: 16 },
      { header: "Date Promise", key: "datePromise", width: 16 },
      { header: "Score", key: "score", width: 10 },
      { header: "Última respuesta", key: "lastReplyAt", width: 18 },
      { header: "Última intención", key: "lastIntent", width: 18 },
      { header: "Total mensajes", key: "totalMessages", width: 14 },
      { header: "Total respuestas", key: "totalReplies", width: 14 },
      { header: "Notas", key: "notes", width: 30 },
      { header: "Alta", key: "createdAt", width: 18 },
    ]
    clientSheet.addRows(
      clients.map((c) => ({
        country: c.country || "",
        customerId: c.customerId ?? "",
        name: c.name,
        phone: c.phone,
        rfc: c.rfc || "",
        collectorId: c.collectorId ?? "",
        team: c.team || "",
        teamLeader: c.teamLeader || "",
        collector: c.collector || "",
        invoiceNumber: c.invoiceNumber || "",
        createDate: c.createDate ? new Date(c.createDate as unknown as string) : null,
        dueDate: c.dueDate ? new Date(c.dueDate as unknown as string) : null,
        agingDays: c.agingDays ?? "",
        loanLease: c.loanLease || "",
        debt: c.debt,
        usdAmount: c.usdAmount ?? "",
        status: STATUS_LABEL[c.status as string] || c.status,
        risk: RISK_LABEL[c.risk as string] || c.risk,
        channel: c.channel,
        contact: c.contact || "",
        lastContactAt: c.lastContactAt ? new Date(c.lastContactAt as unknown as string) : null,
        nextAction: c.nextAction || "",
        paymentPromiseAmount: c.paymentPromiseAmount ?? "",
        datePromise: c.datePromise ? new Date(c.datePromise as unknown as string) : null,
        score: c.score,
        lastReplyAt: c.lastReplyAt ? new Date(c.lastReplyAt as unknown as string) : null,
        lastIntent: c.lastIntent || "",
        totalMessages: c.totalMessages,
        totalReplies: c.totalReplies,
        notes: c.notes || "",
        createdAt: c.createdAt ? new Date(c.createdAt as unknown as string) : null,
      }))
    )

    const promiseSheet = workbook.addWorksheet("Promesas de pago")
    promiseSheet.columns = [
      { header: "Cliente", key: "name", width: 25 },
      { header: "Teléfono", key: "phone", width: 15 },
      { header: "Monto", key: "amount", width: 12 },
      { header: "Fecha compromiso", key: "promisedDate", width: 18 },
      { header: "Estado", key: "status", width: 15 },
      { header: "Detectada por IA", key: "detectedByAI", width: 16 },
      { header: "Notas", key: "notes", width: 30 },
    ]
    promiseSheet.addRows(
      promises.map((p) => {
        const client = clientById.get(String(p.clientId))
        return {
          name: client?.name || "—",
          phone: client?.phone || "—",
          amount: p.amount,
          promisedDate: p.promisedDate ? new Date(p.promisedDate as unknown as string) : null,
          status: PROMISE_STATUS_LABEL[p.status as string] || p.status,
          detectedByAI: p.detectedByAI ? "Sí" : "No",
          notes: p.notes || "",
        }
      })
    )

    const callSheet = workbook.addWorksheet("Llamadas")
    callSheet.columns = [
      { header: "Cliente", key: "name", width: 25 },
      { header: "Teléfono", key: "phone", width: 15 },
      { header: "Fecha", key: "createdAt", width: 18 },
      { header: "Estado", key: "status", width: 15 },
      { header: "Monto promesa", key: "amount", width: 14 },
      { header: "Fecha promesa", key: "promiseDate", width: 16 },
      { header: "Requiere asesor", key: "requiresHuman", width: 16 },
      { header: "Transcript", key: "transcript", width: 60 },
    ]
    callSheet.addRows(
      calls.map((call) => {
        const client = call.clientId ? clientById.get(String(call.clientId)) : undefined
        const transcriptText = (call.transcript || [])
          .map((t) => `${t.role === "assistant" ? "IA" : "Cliente"}: ${t.content}`)
          .join(" | ")
        return {
          name: client?.name || "—",
          phone: call.phone || client?.phone || "—",
          createdAt: call.createdAt ? new Date(call.createdAt as unknown as string) : null,
          status: CALL_STATUS_LABEL[call.status as string] || call.status,
          amount: call.amount || "",
          promiseDate: call.promiseDate ? new Date(call.promiseDate as unknown as string) : "",
          requiresHuman: call.requiresHuman ? "Sí" : "No",
          transcript: transcriptText,
        }
      })
    )

    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `cobranzaia-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(Buffer.from(buffer))
  } catch (error) {
    console.error("Error exportClients:", error)
    res.status(500).json({ message: "Error exportando clientes a Excel" })
  }
}

export async function downloadImportTemplate(req: Request, res: Response) {
  try {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Clientes")
    sheet.columns = [
      { header: "Country", key: "country", width: 12 },
      { header: "CustomerID", key: "customerId", width: 12 },
      { header: "CustomerName", key: "name", width: 25 },
      { header: "Telefono", key: "phone", width: 15 },
      { header: "RFC", key: "rfc", width: 16 },
      { header: "CollectorID", key: "collectorId", width: 12 },
      { header: "Team", key: "team", width: 14 },
      { header: "TeamLeader", key: "teamLeader", width: 16 },
      { header: "Collector", key: "collector", width: 16 },
      { header: "Invoice Number", key: "invoiceNumber", width: 16 },
      { header: "Create Date", key: "createDate", width: 16 },
      { header: "Due Date", key: "dueDate", width: 16 },
      { header: "Aging Days", key: "agingDays", width: 12 },
      { header: "Loan/Lease", key: "loanLease", width: 12 },
      { header: "Deuda", key: "debt", width: 12 },
      { header: "USD Amount", key: "usdAmount", width: 14 },
      { header: "Canal", key: "channel", width: 14 },
      { header: "Riesgo", key: "risk", width: 12 },
      { header: "Contact", key: "contact", width: 18 },
      { header: "Next Action", key: "nextAction", width: 18 },
      { header: "Payment Promise", key: "paymentPromiseAmount", width: 16 },
      { header: "Date Promise", key: "datePromise", width: 16 },
      { header: "Notas", key: "notes", width: 30 },
    ]
    sheet.getRow(1).font = { bold: true }
    sheet.addRow({
      country: "Mexico",
      customerId: 1001,
      name: "Carlos García",
      phone: "6561234567",
      rfc: "GARC800101AB1",
      collectorId: 5,
      team: "Norte",
      teamLeader: "Ana Ruiz",
      collector: "Jorge Pérez",
      invoiceNumber: "INV-0001",
      createDate: new Date(),
      dueDate: new Date(),
      agingDays: 30,
      loanLease: "Loan",
      debt: 4500,
      usdAmount: 250,
      channel: "whatsapp",
      risk: "medio",
      contact: "6561234567",
      nextAction: "Llamar",
      paymentPromiseAmount: 1000,
      datePromise: new Date(),
      notes: "Cliente frecuente",
    })

    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", 'attachment; filename="plantilla-clientes.xlsx"')
    res.send(Buffer.from(buffer))
  } catch (error) {
    console.error("Error downloadImportTemplate:", error)
    res.status(500).json({ message: "Error generando la plantilla" })
  }
}

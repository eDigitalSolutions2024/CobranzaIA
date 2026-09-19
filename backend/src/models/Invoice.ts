import mongoose from "mongoose"

const InvoiceSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
    },

    // Número de factura del sistema Hptf — identificador distinto al invoiceNumber
    // interno, viene tal cual del Excel de facturas (ej. "F001-0748201").
    hptfInvoiceNumber: {
      type: String,
      default: null,
    },

    contractNumber: {
      type: String,
      default: null,
    },

    // LC, REGULAR, EVERGREEN, BUYOUT, etc. — texto libre tal como viene del Excel,
    // el catálogo de tipos puede crecer sin requerir migración.
    invoiceType: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      default: 0,
    },

    // `amount` convertido a pesos según `currencyCode` (ver utils/currency.ts). null si
    // la moneda de la factura todavía no tiene tasa configurada en Settings — nunca se
    // asume 1:1, así no se cuenta mal en Client.debt (ver syncClientFromInvoices).
    amountMxn: {
      type: Number,
      default: null,
    },

    // Saldo restante en USD al momento de la importación (columna "USD Remaining
    // Amount Due" del Excel) — puede diferir de `amount` si ya hubo pagos parciales.
    // OJO: esta columna SIEMPRE viene en dólares sin importar `currencyCode` (así se
    // llama la columna de origen), por eso se convierte con la tasa de USD, no la de
    // currencyCode.
    remainingAmount: {
      type: Number,
      default: null,
    },

    // `remainingAmount` convertido a pesos con la tasa de USD. null si todavía no hay
    // tasa de USD configurada.
    remainingAmountMxn: {
      type: Number,
      default: null,
    },

    // Bucket de mora tal como viene del Excel (ej. "A. Current", "C. 31-60") — se
    // guarda el texto crudo, no se traduce al enum `status` de abajo.
    agingTarget: {
      type: String,
      default: null,
    },

    collector: {
      type: String,
      default: null,
    },

    teamLeader: {
      type: String,
      default: null,
    },

    currencyCode: {
      type: String,
      default: null,
    },

    customerCountry: {
      type: String,
      default: null,
    },

    issueDate: {
      type: Date,
      default: null,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "overdue", "cancelled"],
      default: "pending",
    },

    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model("Invoice", InvoiceSchema)

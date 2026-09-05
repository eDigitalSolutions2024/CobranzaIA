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

    // Saldo restante en USD al momento de la importación (columna "USD Remaining
    // Amount Due" del Excel) — puede diferir de `amount` si ya hubo pagos parciales.
    remainingAmount: {
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

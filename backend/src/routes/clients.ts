import { NextFunction, Request, Response, Router } from "express"
import multer from "multer"

import {
  getClients,
  createClient,
  updateClient,
  getClientDetail,
  importClients,
  exportClients,
  downloadImportTemplate,
  deleteClient,
  getClientFilterOptions,
  markNeedsAdminSent,
} from "../controllers/clientController"
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  importInvoices,
} from "../controllers/invoiceController"
import { requireAuth } from "../middleware/auth"

const upload = multer({
  storage: multer.memoryStorage(),
  // 20 MB: el Excel de facturas de HP ya pesa ~1.5 MB con 888 clientes y crece con cada cliente nuevo.
  // El límite de Nginx (client_max_body_size) debe ser igual o mayor, o responde 413 antes de llegar aquí.
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Solo se permiten archivos Excel (.xlsx, .xls)"))
    }
  },
})

function uploadClientsFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error subiendo el archivo"
      return res.status(400).json({ message })
    }
    next()
  })
}

const router = Router()

router.get("/clients", requireAuth, getClients)
router.get("/clients/filter-options", requireAuth, getClientFilterOptions)
router.get("/clients/export", requireAuth, exportClients)
router.get("/clients/import-template", requireAuth, downloadImportTemplate)
router.get("/clients/:id/detail", requireAuth, getClientDetail)
router.post("/clients", requireAuth, createClient)
router.patch("/clients/:id", requireAuth, updateClient)
router.post("/clients/import", requireAuth, uploadClientsFile, importClients)
router.delete("/clients/:id", requireAuth, deleteClient)
router.post("/clients/:id/needs-admin/sent", requireAuth, markNeedsAdminSent)

router.post("/clients/:id/invoices", requireAuth, createInvoice)
router.post("/invoices/import", requireAuth, uploadClientsFile, importInvoices)
router.patch("/invoices/:invoiceId", requireAuth, updateInvoice)
router.delete("/invoices/:invoiceId", requireAuth, deleteInvoice)

export default router

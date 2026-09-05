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
  limits: { fileSize: 5 * 1024 * 1024 },
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
router.get("/clients/export", requireAuth, exportClients)
router.get("/clients/import-template", requireAuth, downloadImportTemplate)
router.get("/clients/:id/detail", requireAuth, getClientDetail)
router.post("/clients", requireAuth, createClient)
router.patch("/clients/:id", requireAuth, updateClient)
router.post("/clients/import", requireAuth, uploadClientsFile, importClients)
router.delete("/clients/:id", requireAuth, deleteClient)

router.post("/clients/:id/invoices", requireAuth, createInvoice)
router.post("/invoices/import", requireAuth, uploadClientsFile, importInvoices)
router.patch("/invoices/:invoiceId", requireAuth, updateInvoice)
router.delete("/invoices/:invoiceId", requireAuth, deleteInvoice)

export default router

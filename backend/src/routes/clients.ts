import {
Router
}
from "express"

import { getClients, createClient, getClientDetail } from "../controllers/clientController"

const router = Router()

router.get("/clients", getClients)
router.get("/clients/:id/detail", getClientDetail)
router.post("/clients", createClient)

export default router
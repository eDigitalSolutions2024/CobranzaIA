import {
Router
}
from "express"

import {

getClients,

createClient

}
from "../controllers/clientController"

const router=
Router()

router.get(
"/clients",
getClients
)

router.post(
"/clients",
createClient
)

export default router
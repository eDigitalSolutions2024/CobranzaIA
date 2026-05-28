export async function fetchClients(){

const res=

await fetch(
"http://localhost:3002/api/clients"
)

return res.json()

}
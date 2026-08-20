// tsc no copia archivos que no sean .ts (como el JSON del flujo de voz) a dist/.
// Este script corre después del build para que dist/flows exista en producción,
// igual que en dev con ts-node (que lee directo de src/).
const fs = require("fs")
const path = require("path")

const src = path.join(__dirname, "..", "src", "flows")
const dest = path.join(__dirname, "..", "dist", "flows")

if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[copy-assets] ${src} -> ${dest}`)
}

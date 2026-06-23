import 'dotenv/config'
import twilio from 'twilio'

const SID   = process.env.TWILIO_ACCOUNT_SID ?? ''
const TOKEN = process.env.TWILIO_AUTH_TOKEN  ?? ''
const SEP   = '─'.repeat(46)

async function main(): Promise<void> {
  console.log('\n' + SEP)
  console.log('  DIAGNOSTICO TWILIO — CobranzaIA')
  console.log(SEP)

  if (!SID || SID.startsWith('ACxxxxxx') || !TOKEN || TOKEN === 'your_twilio_auth_token') {
    console.error('\n  x  Credenciales placeholder detectadas.')
    console.error('     Edita backend/.env con tu Account SID y Auth Token reales.\n')
    process.exit(1)
  }

  console.log(`\n  SID leido : ${SID.slice(0, 8)}${'*'.repeat(24)}`)

  const client = twilio(SID, TOKEN)

  try {
    const account = await client.api.accounts(SID).fetch()

    console.log('\n  Cuenta:')
    console.log(`    SID          : ${account.sid}`)
    console.log(`    Nombre       : ${account.friendlyName}`)
    console.log(`    Estado       : ${account.status}`)
    console.log(`    Tipo         : ${account.type}`)

    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 })
    console.log(`\n  Numeros activos       : ${numbers.length}`)
    if (numbers.length === 0) {
      console.log('    (sin numeros — cuenta Trial sin numero comprado aun)')
    } else {
      numbers.forEach((n) => console.log(`    ${n.phoneNumber}  ${n.friendlyName}`))
    }

    const verified = await client.outgoingCallerIds.list({ limit: 20 })
    console.log(`\n  Numeros verificados   : ${verified.length}`)
    if (verified.length === 0) {
      console.log('    (ninguno — agrega tu celular en Twilio Console > Verified Caller IDs)')
    } else {
      verified.forEach((v) => console.log(`    ${v.phoneNumber}  ${v.friendlyName}`))
    }

    console.log('\n' + SEP)
    console.log('  OK  Autenticacion Twilio exitosa.')
    console.log('      Backend listo para recibir llamadas al configurar un numero.')
    console.log(SEP + '\n')

  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: number }
    console.error('\n  x  Error conectando con Twilio:')
    if (e.status === 401) {
      console.error('     401 — Credenciales invalidas. Revisa Account SID y Auth Token.')
    } else {
      console.error(`     ${e.message ?? String(err)}`)
      if (e.code) console.error(`     Codigo Twilio: ${e.code}`)
    }
    console.log(SEP + '\n')
    process.exit(1)
  }
}

main()

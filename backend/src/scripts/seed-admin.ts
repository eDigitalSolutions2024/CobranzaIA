import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { connectDB } from '../db'
import User from '../models/User'

async function main(): Promise<void> {
  const [, , name, email, password] = process.argv

  if (!name || !email || !password) {
    console.log('\nUso: npm run seed:admin -- "Admin" correo@dominio.com admin\n')
    process.exit(1)
  }

  await connectDB()

  const normalizedEmail = email.toLowerCase().trim()
  const existing = await User.findOne({ email: normalizedEmail })

  if (existing) {
    console.log(`\nYa existe un usuario con el email ${normalizedEmail}\n`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({ name, email: normalizedEmail, passwordHash })

  console.log(`\nUsuario creado: ${user.email} (id: ${user._id})\n`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((error) => {
  console.error('Error creando el usuario:', error)
  process.exit(1)
})

import mongoose from 'mongoose'

let isConnected = false

// Configurar Mongoose para que no haga "buffer" de queries si falla la conexión.
// Así el servidor fallará rápido (Fail-Fast) en lugar de colgarse 10 segundos.
mongoose.set('bufferCommands', false);

export const connectDB = async () => {
  if (isConnected) {
    return
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('⚠️ MONGODB_URI no está definido. Ignorando conexión a BD para evitar crash en modo local.')
    return
  }
  
  try {
    const db = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Timeout de 5s en lugar de 30s
    })
    isConnected = db?.connection?.readyState === 1
    console.log('✅ MongoDB conectado')
  } catch (error) {
    console.error('❌ Error conectando a MongoDB. Revisa tus credenciales en el .env y que la IP esté permitida en Atlas:', error)
  }
}

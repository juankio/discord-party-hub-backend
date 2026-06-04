import pino from 'pino';

// Evaluamos de forma segura el entorno de ejecución
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Configuración condicional estricta:
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined, // En producción se desactiva pino-pretty y genera JSON nativo
});

export default logger;

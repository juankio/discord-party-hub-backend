# ==========================================
# Etapa 1: Base de ejecución
# ==========================================
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# ==========================================
# Etapa 2: Instalación de dependencias
# ==========================================
FROM base AS install
# Se copian los manifiestos de dependencias. 
# El uso de comodín maneja tanto bun.lockb (binario) como bun.lock (texto, Bun 1.2+).
COPY package.json bun.lock* ./

# Instalación estricta ignorando dependencias de desarrollo (devDependencies)
# --frozen-lockfile garantiza que no se alteren las versiones aprobadas
RUN bun install --frozen-lockfile --production

# ==========================================
# Etapa 3: Artefacto final inmutable
# ==========================================
FROM base AS release
WORKDIR /app

# Medida de Seguridad ISO 27001 / Menor Privilegio:
# El contenedor no debe correr como root. Cambiamos al usuario interno 'bun'.
USER bun

# Forzar el entorno a producción para optimizaciones internas de librerías (como Express y Pino)
ENV NODE_ENV=production

# Copiar únicamente las dependencias de producción limpias de la etapa previa
COPY --from=install --chown=bun:bun /app/node_modules ./node_modules

# Copiar el código fuente garantizando que el usuario 'bun' sea el propietario
COPY --chown=bun:bun src ./src

# CRÍTICO: Si utilizas alias de rutas (path mapping como "@/services") en tu TypeScript, 
# Bun necesita leer el archivo de configuración. Descomenta la siguiente línea si es tu caso:
# COPY --chown=bun:bun tsconfig.json ./

# Documentación del puerto interno. Azure Container Apps ignorará este valor para el Ingress externo,
# pero sirve como referencia técnica obligatoria.
EXPOSE 3001

# Ejecución directa y nativa del archivo TypeScript sin paso de transpilación intermedio
ENTRYPOINT [ "bun", "run", "src/server.ts" ]

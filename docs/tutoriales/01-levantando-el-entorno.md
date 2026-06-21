# Tutorial: Levantando el Entorno de Desarrollo

Este tutorial te guiará paso a paso para configurar tu entorno local y ejecutar el backend de **Discord Party Hub**.

## 1. Requisitos Previos

Antes de empezar, asegúrate de tener instalado lo siguiente en tu máquina:
- **Bun**: Nuestro entorno de ejecución oficial (¡Prohibido usar npm o node directamente!).
- **MongoDB**: Una instancia local o un cluster en MongoDB Atlas.

## 2. Instalación de Dependencias

Clona el repositorio y entra a la carpeta del backend. Luego, instala las dependencias usando Bun:

```bash
cd discord-party-hub-backend
bun install
```

## 3. Variables de Entorno

Copia el archivo `.env.example` (si existe) o crea un archivo `.env` en la raíz del backend con el siguiente contenido básico:

```env
PORT=3001
MONGO_URI=mongodb://localhost:27017/discord-party-hub
JWT_SECRET=tu_secreto_super_seguro
```

## 4. Ejecución del Servidor

Para levantar el servidor en modo desarrollo (con recarga en caliente):

```bash
bun run dev
```

Deberías ver en la consola un mensaje indicando que el servidor está corriendo en el puerto 3001 y que la conexión a MongoDB ha sido exitosa.

## 5. Corriendo los Tests

Para asegurar que todo funciona correctamente (especialmente los motores de juego):

```bash
bun test
```

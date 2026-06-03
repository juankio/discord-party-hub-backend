<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=transparent&color=f97316&height=150&section=header&text=Party%20Hub%20Backend&fontSize=40&fontColor=ffffff" alt="Backend Banner" />
  <p><em>El Árbitro Zero-Trust y motor en tiempo real de Discord Party Hub.</em></p>
  <p>
    <img src="https://img.shields.io/badge/Bun-Runtime-000000?style=flat-square&logo=bun" alt="Bun">
    <img src="https://img.shields.io/badge/Socket.io-v4-010101?style=flat-square&logo=socket.io" alt="Socket.io">
    <img src="https://img.shields.io/badge/Mongoose-ODM-880000?style=flat-square&logo=mongoose" alt="Mongoose">
    <img src="https://img.shields.io/badge/Zod-Validation-3178C6?style=flat-square&logo=typescript" alt="Zod">
  </p>
</div>

---

## 🧠 Filosofía Zero-Trust (Cero Confianza)

En Party Hub, **el Frontend es ciego e ignorante**. Nunca calcula reglas, nunca valida movimientos y nunca confía en el estado del cliente. Todo recae sobre este Backend.

1. **Intención vs. Acción:** El cliente no ejecuta una acción, envía una "intención" al servidor (Ej: `emit('play_card', { card: 'red_5' })`).
2. **Validación Estricta:** El `[Juego]Engine` (Ej. `UnoEngine.ts`) intercepta la intención, verifica si es el turno del jugador, valida que realmente posea esa carta en memoria del servidor y aplica las reglas de la casa.
3. **Sincronización:** Si la jugada es válida, el estado muta y el servidor hace un *broadcast* del nuevo estado a todos en la sala. Si hay trampa, la intención es rechazada de forma silenciosa o con un evento de `error`.

---

## 🏛️ Arquitectura Híbrida (API + WebSockets)

```text
/backend
├── src/
│   ├── config/
│   │   └── db.ts                # Conexión persistente a MongoDB Atlas.
│   ├── controllers/
│   │   ├── auth.controller.ts   # Autenticación Google OAuth2 y perfiles (JWT).
│   │   └── leaderboard.ts       # API Segura para el Top Global de Victorias.
│   ├── core/
│   │   ├── RoomManager.ts       # Orquestador de salas en memoria (Garbage Collection + Manejo de Host).
│   ├── games/
│   │   ├── uno/
│   │   │   └── UnoEngine.ts     # Máquina de estados Zero-Trust para partidas de UNO.
│   │   └── [...]                # Otros motores (Parchís, Pinturillo, etc).
│   └── server.ts                # Entry point que fusiona Express.js y Socket.io en el mismo puerto (3001).
```

---

## 🛠️ Subsistemas Principales

### 1. API REST (Express.js)
El servidor ahora asume todo el peso de la base de datos y peticiones HTTP.
- **Autenticación (OAuth2):** Se procesa enteramente en el servidor a través de las rutas `/api/auth/google/login` y `/api/auth/google/callback`, redirigiendo al cliente con su sesión iniciada.
- **Seguridad CORS y JWT:** Todas las rutas, como el Leaderboard o la edición de perfiles, están bloqueadas bajo validación de tokens JWT extraídos del encabezado `Authorization: Bearer <token>`.

### 2. Gestión de Salas (`RoomManager` - WebSockets)
El sistema utiliza una estructura `Map<string, RoomData>` en memoria RAM para un rendimiento instantáneo (0ms latency database reads para el juego en vivo).
- **Persistencia en Memoria:** Sobrevive a desconexiones accidentales (F5 o caída de red de Discord). Los jugadores pasan a estado `isOffline: true` por un período de gracia de 30 segundos.
- **Garbage Collection (GC):** Para evitar fugas de memoria, cualquier sala inactiva por más de 1 hora o abandonada por todos sus miembros es automáticamente barrida y destruida por el Garbage Collector.

### 3. El Motor de UNO (`UnoEngine`)
Soporta una inmensa variedad de reglas de la casa populares implementadas de forma nativa:
- `stackDrawCards`: Acumulación infinita de cartas `+2` y `+4` (Guerra de robos).
- `interceptExact`: Corte/Intercepción exacta si tienes una carta idéntica a la que acaba de ser jugada.
- `zeroAndSevenRules`: Intercambio de manos con el 7 y rotación de manos con el 0.

---

## 🚀 Inicio y Configuración (Modo Desarrollo)

Este entorno exige el uso de **Bun**.

1. Asegúrate de tener tu archivo `.env` configurado:
   ```env
   PORT=3001
   MONGODB_URI=mongodb+srv://<usuario>:<password>@cluster...
   ```
2. Instalar y arrancar:
   ```bash
   bun install
   bun run dev
   ```

El servidor quedará a la escucha de peticiones HTTP en `/api` y conexiones WebSockets persistentes a través de `socket.io`.

# Concepto: Arquitectura Core-Adapter

El backend de **Discord Party Hub** maneja múltiples minijuegos en tiempo real. Para evitar que el código se convierta en "código espagueti" acoplado a la red, utilizamos el patrón **Core-Adapter**.

## El Problema del Acoplamiento
En las primeras versiones del proyecto, los motores de juego (`UnoEngine`, `ParchisEngine`) recibían un callback (`broadcastCallback`) en su constructor para emitir datos hacia los clientes a través de `Socket.io`. 
Esto causaba:
1. **Dificultad de Testing:** Probar la lógica del juego implicaba falsear (mockear) librerías de red complejas.
2. **Mezcla de Responsabilidades:** El motor que calculaba las reglas de negocio del UNO, también se encargaba de decidir a qué canal de socket enviar los datos.

## La Solución: Core y Adapter separados

### 1. El Core (Motores de Juego)
Los archivos `*Engine.ts` representan la lógica pura del dominio.
- Heredan de `EventEmitter` de Node.js.
- Son simuladores matemáticos de estado cerrados. 
- Solo procesan acciones ("tirar un dado", "robar carta") y emiten notificaciones abstractas en Javascript: `this.emit('player_won', userId)`.

### 2. El Adapter (Archivos Setup)
Los archivos `*Setup.ts` son la Capa de Infraestructura.
- Conocen sobre el entorno de red (`Server` de `socket.io`, identificadores de sala).
- "Escuchan" al motor (Core) y "Traducen" hacia la red.
- Conectan la lógica abstracta del juego con los controladores persistentes, como el `WinHandler` que actualiza la base de datos de MongoDB.

## Beneficios
- **Testing Inmaculado:** Podemos ejecutar simulaciones de 100 partidas de UNO en `bun test` en menos de 100 milisegundos sin siquiera levantar una conexión HTTP/WS.
- **Escalabilidad:** Si en el futuro migramos a WebRTC o Server-Sent Events (SSE), los `Engine` no sufrirán ni una sola modificación, únicamente se ajustará la capa `Setup`.

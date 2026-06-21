# Guía: Cómo añadir un nuevo Minijuego

Añadir un nuevo minijuego en **Discord Party Hub** es un proceso sencillo si seguimos nuestra arquitectura **Core-Adapter**. Esta guía te muestra los pasos exactos.

## Paso 1: Crear el Motor (El Core)

1. Crea una nueva carpeta en `src/games/mi-juego/`.
2. Crea tu clase principal `MiJuegoEngine.ts` que herede de `EventEmitter` nativo de Node.js.
3. ¡Regla de oro! Tu motor **no debe importar ni saber qué es Socket.io**.

```typescript
import { EventEmitter } from 'events';

export class MiJuegoEngine extends EventEmitter {
  public state = 'WAITING';

  public startGame() {
    this.state = 'PLAYING';
    this.emit('game_state_update', this.getPublicState());
  }

  public winGame(userId: string) {
    this.state = 'FINISHED';
    this.emit('player_won', userId);
  }
}
```

## Paso 2: Crear el Setup (El Adaptador)

Crea el archivo `src/games/mi-juego/MiJuegoSetup.ts`. Aquí es donde conectaremos los eventos puros de tu motor con la red (`Socket.io`).

```typescript
import type { Server } from "socket.io";
import { MiJuegoEngine } from "./MiJuegoEngine.js";
import { handlePlayerWon } from "../../core/WinHandler.js";

export function setupMiJuego(roomId: string, room: any, io: Server, rules: any) {
  room.gameType = 'mi-juego';
  const engine = new MiJuegoEngine();
  room.gameEngine = engine;

  // Adaptador: Escuchar eventos del Core y emitirlos por red
  engine.on('game_state_update', (state) => {
    io.to(roomId).emit('game_state_update', state);
  });

  engine.on('player_won', (winnerId) => {
    handlePlayerWon(roomId, winnerId, room, io, 'miJuegoWins');
  });

  // Añadir jugadores e iniciar
  room.users.forEach((u: any) => engine.addPlayer(u.userId));
  
  io.to(roomId).emit("game_started", { gameType: 'mi-juego' });
  engine.startGame();
}
```

## Paso 3: Registrar el Setup en el Dispatcher

Abre `src/core/GameDispatcher.ts` y añade tu juego al router principal:

```typescript
import { setupMiJuego } from "../games/mi-juego/MiJuegoSetup.js";

// Dentro de startGameDispatcher...
if (data.gameType === 'mi-juego') {
  setupMiJuego(roomId, room, io, data.rules);
}
```

¡Listo! Has añadido un nuevo minijuego de forma modular y altamente testeable.

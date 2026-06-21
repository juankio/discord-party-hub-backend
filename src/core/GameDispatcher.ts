/**
 * Orquestador principal de Partidas (Game Dispatcher).
 * 
 * Actua como enrutador principal cuando el Host de una sala decide iniciar una partida.
 * En base al `gameType`, delega la inicialización del juego al adaptador (Setup) correspondiente,
 * respetando el patrón Core-Adapter.
 * 
 * @module GameDispatcher
 */

import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "./Logger.js";
import type { RoomManager } from "./RoomManager.js";
import { registerUnoRoutes } from "../games/uno/UnoSocketRouter.js";
import { registerImpostorRoutes } from "../games/impostor/ImpostorSocketRouter.js";
import { registerStopRoutes } from "../games/stop/StopSocketRouter.js";
import { registerParchisRoutes } from "../games/parchis/ParchisSocketRouter.js";

import { setupUnoGame } from "../games/uno/UnoSetup.js";
import { setupStopGame } from "../games/stop/StopSetup.js";
import { setupParchisGame } from "../games/parchis/ParchisSetup.js";
import { setupImpostorGame } from "../games/impostor/ImpostorSetup.js";

// -- Esquemas de validación ZOD --
const StartGameSchema = z.object({
  gameType: z.enum(["uno", "parchis", "stop", "pinturillo", "liars", "impostor"]).default("uno"),
  rules: z.any().optional()
});

// Guard global
function validateSocketContext(socket: Socket): boolean {
  if (!socket.data || !socket.data.roomId || !socket.data.userId) {
    logger.warn(`[SECURITY] Accion bloqueada sin autenticacion en socket: ${socket.id}`);
    return false;
  }
  return true;
}

export function registerAllGameRoutes(socket: Socket, roomManager: RoomManager) {
  const io = (roomManager as any).io; // Accessing internal io instance
  const rooms = roomManager.getRoomsMap();

  // Register all game-specific routes
  registerUnoRoutes(socket, roomManager, validateSocketContext);
  registerStopRoutes(socket, roomManager, validateSocketContext);
  registerParchisRoutes(socket, roomManager, validateSocketContext);

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateSocketContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Engine for socket ${socket.id}: ${e}`);
    }
  };

  socket.on("return_to_lobby", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;
    const isFinished = room.gameEngine?.state === 'FINISHED';
    if (isFinished || room.hostUserId === socket.data.userId) {
      room.gameEngine = undefined;
      room.gameType = undefined;
      io.to(socket.data.roomId).emit("return_to_lobby");
    }
  }));
}

export function handleImpostorEvents(socket: Socket, roomManager: RoomManager) {
  // Register all Impostor-specific routes (vote, return_to_lobby)
  registerImpostorRoutes(socket, roomManager, validateSocketContext);
}

export function startGameDispatcher(socket: Socket, roomManager: RoomManager) {
  const io = (roomManager as any).io;
  const rooms = roomManager.getRoomsMap();

  socket.on("update_room_rules", (payload: any) => {
    if (!validateSocketContext(socket)) return;
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostUserId !== socket.data.userId) return;

    room.roomRules = payload;
    io.to(socket.data.roomId).emit("room_update", {
      users: room.users,
      hostUserId: room.hostUserId,
      roomRules: room.roomRules,
      selectedGame: room.selectedGame
    });
  });

  socket.on("update_selected_game", (gameId: string) => {
    if (!validateSocketContext(socket)) return;
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostUserId !== socket.data.userId) return;

    room.selectedGame = gameId;
    io.to(socket.data.roomId).emit("room_update", {
      users: room.users,
      hostUserId: room.hostUserId,
      roomRules: room.roomRules,
      selectedGame: room.selectedGame
    });
  });

  socket.on("start_game", (payload: any) => {
    logger.warn(`[DEBUG] start_game received: ${JSON.stringify(payload)}`);
    if (!validateSocketContext(socket)) return;

    const result = StartGameSchema.safeParse(payload);
    if (!result.success) {
      logger.warn(`[ZOD] Payload de start_game invalido de ${socket.data.userId} Error: ${JSON.stringify(result.error)}`);
      return;
    }

    const data = result.data;
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;
    const room = rooms.get(roomId);
    
    if (!room || room.hostUserId !== userId) {
      logger.warn(`[SECURITY] El usuario ${userId} intento iniciar partida sin ser host.`);
      return; 
    }

    if (data.gameType === 'impostor') {
      setupImpostorGame(roomId, room, io);
    } else if (data.gameType === 'uno') {
      setupUnoGame(roomId, room, io, data.rules);
    } else if (data.gameType === 'stop') {
      setupStopGame(roomId, room, io, data.rules || {});
    } else if (data.gameType === 'parchis') {
      setupParchisGame(roomId, room, io, data.rules || {});
    }
  });
}

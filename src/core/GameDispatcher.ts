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
const ParchisRulesPayloadSchema = z.object({
  diceCount: z.coerce.number().int().min(1).max(2).default(1),
  tokensPerPlayer: z.coerce.number().int().min(1).max(8).default(4),
  parchisBoardSize: z.coerce.number().int().min(4).max(8).default(4)
});

const UnoRulesPayloadSchema = z.object({
  stackDrawCards: z.boolean().default(false),
  drawUntilPlayable: z.boolean().default(false),
  playMultipleSame: z.boolean().default(false),
  interceptExact: z.boolean().default(false),
  zeroAndSevenRules: z.boolean().default(false),
  extendedLobby: z.boolean().default(false)
});

const StopRulesPayloadSchema = z.object({
  categories: z.array(z.string().max(50)).max(12).default(["Nombres", "Colores", "Paises", "Animales", "Cosas"]),
  rounds: z.coerce.number().int().min(1).max(20).default(5),
  timeLimit: z.coerce.number().int().min(30).max(300).optional(),
  verificationTime: z.coerce.number().int().min(10).max(60).optional(),
  bannedLetters: z.array(z.string().length(1)).max(27).optional()
});

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

    // Si el nuevo juego no soporta bots, los eliminamos
    if (gameId !== 'uno' && gameId !== 'parchis') {
      const hasBots = room.users.some(u => u.isBot);
      if (hasBots) {
        roomManager.botManager.removeBotsFromRoom(socket.data.roomId);
      }
    }

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

    const hasBots = room.users.some(u => u.isBot);
    if (hasBots && data.gameType !== 'uno' && data.gameType !== 'parchis') {
      logger.warn(`[SECURITY] El usuario ${userId} intento iniciar partida con bots en un juego no soportado: ${data.gameType}.`);
      return;
    }

    if (data.gameType === 'parchis') {
      const parsedRules = ParchisRulesPayloadSchema.safeParse(data.rules || {});
      if (!parsedRules.success) {
        logger.warn(`[SECURITY] El usuario ${userId} intento iniciar parchis con reglas invalidas.`);
        return;
      }
      data.rules = parsedRules.data;

      const boardSize = data.rules.parchisBoardSize;
      if (room.users.length > boardSize) {
        logger.warn(`[SECURITY] El usuario ${userId} intento iniciar parchis con demasiados jugadores (${room.users.length} > ${boardSize}).`);
        return;
      }
    }

    if (data.gameType === 'impostor') {
      setupImpostorGame(roomId, room, io);
    } else if (data.gameType === 'uno') {
      const parsedUnoRules = UnoRulesPayloadSchema.safeParse(data.rules || {});
      if (!parsedUnoRules.success) {
        logger.warn(`[SECURITY] El usuario ${userId} intento iniciar uno con reglas invalidas.`);
        return;
      }
      setupUnoGame(roomId, room, io, parsedUnoRules.data, roomManager);
    } else if (data.gameType === 'stop') {
      const parsedStopRules = StopRulesPayloadSchema.safeParse(data.rules || {});
      if (!parsedStopRules.success) {
        logger.warn(`[SECURITY] El usuario ${userId} intento iniciar stop con reglas invalidas.`);
        return;
      }
      setupStopGame(roomId, room, io, parsedStopRules.data, roomManager);
    } else if (data.gameType === 'parchis') {
      setupParchisGame(roomId, room, io, data.rules || {}, roomManager);
    }
  });
}

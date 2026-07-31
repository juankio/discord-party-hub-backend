/**
 * Main Game Dispatcher
 * Acts as the main router when a room Host starts a game.
 * Uses GameFactory to setup the respective game module.
 * 
 * @module GameDispatcher
 */

import type { Socket } from "socket.io";
import { logger } from "./Logger.js";
import type { RoomManager } from "./RoomManager.js";
import { registerUnoRoutes } from "../games/uno/UnoSocketRouter.js";
import { registerImpostorRoutes } from "../games/impostor/ImpostorSocketRouter.js";
import { registerStopRoutes } from "../games/stop/StopSocketRouter.js";
import { registerParchisRoutes } from "../games/parchis/ParchisSocketRouter.js";
import { StartGameSchema, GameFactory } from "./GameFactory.js";
import { z } from 'zod';
import { registerPinturilloRoutes } from "../games/pinturillo/PinturilloSocketRouter.js";
import { registerLiarsRoutes } from "../games/liars-bar/LiarsSocketRouter.js";

function validateSocketContext(socket: Socket): boolean {
  if (!socket.data || !socket.data.roomId || !socket.data.userId) {
    logger.warn(`[SECURITY] Action blocked without auth on socket: ${socket.id}`);
    return false;
  }
  return true;
}

export function registerAllGameRoutes(socket: Socket, roomManager: RoomManager) {
  const io = (roomManager as any).io;
  const rooms = roomManager.getRoomsMap();

  registerUnoRoutes(socket, roomManager, validateSocketContext);
  registerPinturilloRoutes(socket, roomManager, validateSocketContext);
  registerLiarsRoutes(socket, roomManager, validateSocketContext);
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
      room.gameEngine?.destroy?.();
      room.gameEngine = undefined;
      room.gameType = undefined;
      io.to(socket.data.roomId).emit("return_to_lobby");
    }
  }));
}

export function handleImpostorEvents(socket: Socket, roomManager: RoomManager) {
  registerImpostorRoutes(socket, roomManager, validateSocketContext);
}

const UpdateSelectedGameSchema = z.string().min(1).max(50);

export function startGameDispatcher(socket: Socket, roomManager: RoomManager) {
  socket.on("change_seat", (payload: any) => roomManager.handleChangeSeat(socket, payload));
  const io = (roomManager as any).io;
  const rooms = roomManager.getRoomsMap();

  socket.on("update_selected_game", (gameId: any) => {
    if (!validateSocketContext(socket)) return;
    
    const result = UpdateSelectedGameSchema.safeParse(gameId);
    if (!result.success) {
      return logger.warn(`[ZOD] Invalid update_selected_game payload from ${socket.data.userId}: ${JSON.stringify(result.error)}`);
    }
    const validGameId = result.data;
    
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostUserId !== socket.data.userId) return;

    if (room.selectedGame !== validGameId) {
      room.gameEngine?.destroy?.();
      room.gameEngine = undefined;
      room.gameType = undefined;
    }

    room.selectedGame = validGameId;

    const hasBots = room.users.some(u => u.isBot);
    if (hasBots) {
      if (validGameId !== 'uno' && validGameId !== 'parchis' && validGameId !== 'liars') roomManager.botManager.removeBotsFromRoom(socket.data.roomId);
      else roomManager.botManager.recreateBotsForGame(socket.data.roomId, validGameId);
    }

    io.to(socket.data.roomId).emit("room_update", {
      users: room.users, hostUserId: room.hostUserId, roomRules: room.roomRules, selectedGame: room.selectedGame
    });
  });

  socket.on("start_game", (payload: any) => {
    if (!validateSocketContext(socket)) return;

    const result = StartGameSchema.safeParse(payload);
    if (!result.success) {
      return logger.warn(`[ZOD] Invalid start_game payload from ${socket.data.userId}: ${JSON.stringify(result.error)}`);
    }

    const { gameType, rules } = result.data;
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;
    const room = rooms.get(roomId);
    
    if (!room || room.hostUserId !== userId) {
      return logger.warn(`[SECURITY] User ${userId} attempted to start game without being host.`);
    }

    const hasBots = room.users.some(u => u.isBot);
    if (hasBots && !['uno', 'parchis', 'liars'].includes(gameType)) {
      return logger.warn(`[SECURITY] User ${userId} started game with bots in unsupported game: ${gameType}.`);
    }

    GameFactory.startGame(gameType, roomId, room, io, rules, roomManager);
  });
}

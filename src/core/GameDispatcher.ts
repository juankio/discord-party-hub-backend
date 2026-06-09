import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "./Logger.js";
import type { RoomManager } from "./RoomManager.js";
import { UnoEngine } from "../games/uno/UnoEngine.js";
import { StopEngine } from "../games/stop/StopEngine.js";
import type { UnoRules } from "../games/uno/UnoTypes.js";
import type { StopRules } from "../games/stop/StopTypes.js";
import { User } from "../models/User.js";
import { registerUnoRoutes } from "../games/uno/UnoSocketRouter.js";
import { registerStopRoutes } from "../games/stop/StopSocketRouter.js";

// -- Esquemas de validación ZOD --
const StartGameSchema = z.object({
  gameType: z.enum(["uno", "parchis", "stop", "pinturillo", "liars"]).default("uno"),
  rules: z.object({
    stackDrawCards: z.boolean().default(false),
    drawUntilPlayable: z.boolean().default(false),
    playMultipleSame: z.boolean().default(false),
    interceptExact: z.boolean().default(false),
    zeroAndSevenRules: z.boolean().default(false),
    extendedLobby: z.boolean().default(false)
  }).optional()
});

// Guard global
function validateSocketContext(socket: Socket): boolean {
  if (!socket.data || !socket.data.roomId || !socket.data.userId) {
    logger.warn(`[SECURITY] Acción bloqueada sin autenticación en socket: ${socket.id}`);
    return false;
  }
  return true;
}

export function registerAllGameRoutes(socket: Socket, roomManager: RoomManager) {
  const io = (roomManager as any).io; // Accessing internal io instance
  const rooms = roomManager.getRoomsMap();

  registerUnoRoutes(socket, roomManager, validateSocketContext);
  registerStopRoutes(socket, roomManager, validateSocketContext);

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateSocketContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Uno Engine for socket ${socket.id}: ${e}`);
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

export function startGameDispatcher(socket: Socket, roomManager: RoomManager) {
  const io = (roomManager as any).io;
  const rooms = roomManager.getRoomsMap();

  socket.on("update_room_rules", (payload: any) => {
    if (!validateSocketContext(socket)) return;
    const room = rooms.get(socket.data.roomId);
    if (!room || room.hostUserId !== socket.data.userId) return; // Solo el host manda

    room.roomRules = payload;
    // Hacemos broadcast a todos en la sala para que sus checkboxes se muevan también si los están mirando
    io.to(socket.data.roomId).emit("room_update", {
      users: room.users,
      hostUserId: room.hostUserId,
      roomRules: room.roomRules
    });
  });

  socket.on("start_game", (payload: any) => {
    if (!validateSocketContext(socket)) return;

    const result = StartGameSchema.safeParse(payload);
    if (!result.success) {
      logger.warn(`[ZOD] Payload de start_game inválido de ${socket.data.userId}`);
      return;
    }

    const data = result.data;
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;
    const room = rooms.get(roomId);
    
    if (!room || room.hostUserId !== userId) {
      logger.warn(`[SECURITY] El usuario ${userId} intentó iniciar partida sin ser host.`);
      return; 
    }

    if (data.gameType === 'uno') {
      const rules = data.rules as UnoRules;

      room.gameType = 'uno';
      room.gameEngine = new UnoEngine(roomId, async (event: string, eventPayload?: any) => {
        try {
          if (event === 'player_won') {
            room.lastWinnerUserId = eventPayload;
            const user = room.users.find((u: any) => u.userId === eventPayload);
            if (user) {
              user.totalWins += 1;
              io.to(roomId).emit("room_update", { users: room.users, hostUserId: room.hostUserId, roomRules: room.roomRules });
            }
            
            try {
              // Actualizar gamesPlayed para todos en la sala que sean usuarios de MongoDB
              const registeredUserIds = room.users
                .filter((u: any) => /^[0-9a-fA-F]{24}$/.test(u.userId))
                .map((u: any) => u.userId);
                
              if (registeredUserIds.length > 0) {
                await User.updateMany(
                  { _id: { $in: registeredUserIds } },
                  { $inc: { gamesPlayed: 1 }, $set: { lastPlayed: new Date() } }
                );
              }
              
              // Actualizar victoria para el ganador si está registrado
              if (user && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
                await User.findByIdAndUpdate(user.userId, { 
                  $inc: { 'stats.totalWins': 1, 'stats.unoWins': 1 } 
                });
              }
            } catch (dbErr) {
              logger.error(`Error guardando victoria/stats en DB: ${dbErr}`);
            }
            return;
          }
          if (event === 'game_state_update') {
            const targetSocketId = room.users.find((u:any) => u.userId === eventPayload.targetUserId)?.socketId;
   logger.info("Emitting game_state_update to " + targetSocketId + " for " + eventPayload.targetUserId);
            if (targetSocketId) io.to(targetSocketId).emit(event, eventPayload.state);
          } else {
            io.to(roomId).emit(event, eventPayload);
          }
        } catch (e) {
          logger.error(`Error emitiendo evento de juego: ${e}`);
        }
      });

      room.users.forEach((u: any) => {
        room.gameEngine!.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
      });

      io.to(roomId).emit("game_started", { gameType: 'uno' });
      room.gameEngine.startGame(rules, room.lastWinnerUserId);
      logger.info(`🎮 Partida de UNO iniciada en la sala ${roomId}`);
    } else if (data.gameType === 'stop') {
      const rules = (data.rules as any) as StopRules; // Using any for mapping from frontend rules if they differ, or rely on defaults

      room.gameType = 'stop';
      room.gameEngine = new StopEngine(roomId, async (event: string, eventPayload?: any) => {
        try {
          if (event === 'player_won') {
            room.lastWinnerUserId = eventPayload;
            const user = room.users.find((u: any) => u.userId === eventPayload);
            if (user) {
              user.totalWins += 1;
              io.to(roomId).emit("room_update", { users: room.users, hostUserId: room.hostUserId, roomRules: room.roomRules });
            }
            
            try {
              const registeredUserIds = room.users
                .filter((u: any) => /^[0-9a-fA-F]{24}$/.test(u.userId))
                .map((u: any) => u.userId);
                
              if (registeredUserIds.length > 0) {
                await User.updateMany(
                  { _id: { $in: registeredUserIds } },
                  { $inc: { gamesPlayed: 1 }, $set: { lastPlayed: new Date() } }
                );
              }
              
              if (user && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
                await User.findByIdAndUpdate(user.userId, { 
                  $inc: { 'stats.totalWins': 1, 'stats.stopWins': 1 } 
                });
              }
            } catch (dbErr) {
              logger.error(`Error guardando victoria/stats Stop en DB: ${dbErr}`);
            }
            return;
          }
          if (event === 'game_state_update') {
            io.to(roomId).emit(event, eventPayload.state); // En Stop el state es global
          } else {
            io.to(roomId).emit(event, eventPayload);
          }
        } catch (e) {
          logger.error(`Error emitiendo evento de juego Stop: ${e}`);
        }
      });

      room.users.forEach((u: any) => {
        room.gameEngine!.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
      });

      io.to(roomId).emit("game_started", { gameType: 'stop' });
      room.gameEngine.startGame(rules || { categories: ['Nombre', 'Animal', 'Color', 'Cosa', 'Fruta'], rounds: 5 }, room.lastWinnerUserId);
      logger.info(`🛑 Partida de STOP iniciada en la sala ${roomId}`);
    }
  });
}

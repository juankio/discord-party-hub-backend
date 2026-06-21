/**
 * Manejador centralizado de victorias.
 * 
 * Este módulo se encarga de acoplar el evento logico de victoria (`player_won`) 
 * emitido por el Core del juego, con los efectos secundarios de la infraestructura:
 * 1. Actualizar el documento del User en MongoDB (sumando victorias generales y especificas del juego).
 * 2. Transmitir el evento WebSocket real hacia el frontend (`io.to().emit()`).
 *
 * @module WinHandler
 */

import { User } from "../models/User.js";
import { logger } from "./Logger.js";
import type { Server } from "socket.io";

export async function handlePlayerWon(
  roomId: string,
  winnerUserId: string,
  room: any,
  io: Server,
  gameStatsKey: string
) {
  room.lastWinnerUserId = winnerUserId;
  const user = room.users.find((u: any) => u.userId === winnerUserId);
  if (user) {
    user.totalWins += 1;
    // Emitir a todos el evento de quién ganó
    io.to(roomId).emit("player_won", winnerUserId);
    
    // Actualizar estado de la sala
    io.to(roomId).emit("room_update", {
      users: room.users,
      hostUserId: room.hostUserId,
      roomRules: room.roomRules,
      selectedGame: room.selectedGame
    });
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
      const incPayload: any = { 'stats.totalWins': 1 };
      if (gameStatsKey) {
        incPayload[`stats.${gameStatsKey}`] = 1;
      }
      await User.findByIdAndUpdate(user.userId, {
        $inc: incPayload
      });
    }
  } catch (dbErr) {
    logger.error(`Error guardando victoria/stats (${gameStatsKey}) en DB: ${dbErr}`);
  }
}

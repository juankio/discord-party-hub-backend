import type { Server } from "socket.io";
import { ImpostorEngine } from "./ImpostorEngine.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";

export function setupImpostorGame(roomId: string, room: any, io: Server) {
  room.gameType = "impostor";
  room.gameEngine = new ImpostorEngine(roomId, async (event: string, eventPayload?: any) => {
    try {
      if (event === "player_won") {
        if (eventPayload) {
          await handlePlayerWon(roomId, eventPayload, room, io, "");
        }
        return;
      }
      if (event === "game_state_update") {
        const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
        if (targetSocketId) io.to(targetSocketId).emit(event, eventPayload.state);
      } else {
        io.to(roomId).emit(event, eventPayload);
      }
    } catch (e) {
      logger.error("Error emitiendo evento de juego Impostor: " + e);
    }
  });

  room.users.forEach((u: any) => {
    (room.gameEngine as ImpostorEngine).addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "impostor" });
  (room.gameEngine as ImpostorEngine).startGame();
  logger.info(`Partida de IMPOSTOR iniciada en la sala ${roomId}`);
}

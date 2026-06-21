import type { Server } from "socket.io";
import { UnoEngine } from "./UnoEngine.js";
import type { UnoRules } from "./UnoTypes.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";

export function setupUnoGame(roomId: string, room: any, io: Server, rules: UnoRules) {
  room.gameType = "uno";
  room.gameEngine = new UnoEngine(roomId, async (event: string, eventPayload?: any) => {
    try {
      if (event === "player_won") {
        await handlePlayerWon(roomId, eventPayload, room, io, "unoWins");
        return;
      }
      if (event === "game_state_update") {
        const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
        logger.info(`Emitting game_state_update to ${targetSocketId} for ${eventPayload.targetUserId}`);
        if (targetSocketId) io.to(targetSocketId).emit(event, eventPayload.state);
      } else {
        io.to(roomId).emit(event, eventPayload);
      }
    } catch (e) {
      logger.error("Error emitiendo evento de juego Uno: " + e);
    }
  });

  room.users.forEach((u: any) => {
    room.gameEngine!.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "uno" });
  room.gameEngine.startGame(rules, room.lastWinnerUserId);
  logger.info(`🎮 Partida de UNO iniciada en la sala ${roomId}`);
}

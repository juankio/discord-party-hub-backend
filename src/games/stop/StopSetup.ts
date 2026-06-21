import type { Server } from "socket.io";
import { StopEngine } from "./StopEngine.js";
import type { StopRules } from "./StopTypes.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";

export function setupStopGame(roomId: string, room: any, io: Server, frontendRules: any) {
  const rules: StopRules = {
    categories: frontendRules.stopCategories || ["NOMBRE", "ANIMAL", "COLOR", "COSA", "FRUTA"],
    rounds: frontendRules.stopRounds || 5,
    verificationTime: frontendRules.verificationTime,
    bannedLetters: frontendRules.bannedLetters || []
  };

  room.gameType = "stop";
  room.gameEngine = new StopEngine(roomId, async (event: string, eventPayload?: any) => {
    try {
      if (event === "player_won") {
        await handlePlayerWon(roomId, eventPayload, room, io, "stopWins");
        return;
      }
      if (event === "game_state_update") {
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

  io.to(roomId).emit("game_started", { gameType: "stop" });
  room.gameEngine.startGame(rules, room.lastWinnerUserId);
  logger.info(`🛑 Partida de STOP iniciada en la sala ${roomId}`);
}

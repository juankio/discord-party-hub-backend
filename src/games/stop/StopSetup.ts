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

  const engine = new StopEngine(roomId);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      await handlePlayerWon(roomId, eventPayload, room, io, "stopWins");
    } catch (e) {
      logger.error(`Error emitiendo evento de juego Stop (player_won): ${e}`);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    io.to(roomId).emit("game_state_update", eventPayload.state); // En Stop el state es global
  });

  engine.on("stop_called", (eventPayload) => {
    io.to(roomId).emit("stop_called", eventPayload);
  });

  room.users.forEach((u: any) => {
    engine.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "stop" });
  engine.startGame(rules, room.lastWinnerUserId);
  logger.info(`🛑 Partida de STOP iniciada en la sala ${roomId}`);
}

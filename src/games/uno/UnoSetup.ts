import type { Server } from "socket.io";
import { UnoEngine } from "./UnoEngine.js";
import type { UnoRules } from "./UnoTypes.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";

export function setupUnoGame(roomId: string, room: any, io: Server, rules: UnoRules) {
  room.gameType = "uno";
  
  const engine = new UnoEngine(roomId);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      await handlePlayerWon(roomId, eventPayload, room, io, "unoWins");
    } catch (e) {
      logger.error("Error emitiendo evento de juego Uno (player_won): " + e);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      logger.info(`Emitting game_state_update to ${targetSocketId} for ${eventPayload.targetUserId}`);
      if (targetSocketId) io.to(targetSocketId).emit("game_state_update", eventPayload.state);
    } catch (e) {
      logger.error("Error emitiendo evento de juego Uno (game_state_update): " + e);
    }
  });

  engine.on("game_action", (eventPayload) => {
    io.to(roomId).emit("game_action", eventPayload);
  });

  engine.on("game_message", (eventPayload) => {
    io.to(roomId).emit("game_message", eventPayload);
  });

  room.users.forEach((u: any) => {
    engine.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "uno" });
  room.gameEngine.startGame(rules, room.lastWinnerUserId);
  logger.info(`🎮 Partida de UNO iniciada en la sala ${roomId}`);
}

import type { Server } from "socket.io";
import { ParchisEngine } from "./ParchisEngine.js";
import type { ParchisRules } from "./ParchisTypes.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";

export function setupParchisGame(roomId: string, room: any, io: Server, frontendRules: any) {
  const rules: Partial<ParchisRules> = {};
  if (frontendRules.diceCount) rules.diceCount = frontendRules.diceCount;
  if (frontendRules.tokensPerPlayer) rules.tokensPerPlayer = frontendRules.tokensPerPlayer;
  if (frontendRules.parchisBoardSize) rules.parchisBoardSize = frontendRules.parchisBoardSize;

  room.gameType = "parchis";
  
  const engine = new ParchisEngine(roomId);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      await handlePlayerWon(roomId, eventPayload, room, io, "parchisWins");
    } catch (e) {
      logger.error(`Error emitiendo evento de juego Parchis (player_won): ${e}`);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      if (targetSocketId) io.to(targetSocketId).emit("game_state_update", eventPayload.state);
    } catch (e) {
      logger.error(`Error emitiendo evento de juego Parchis (game_state_update): ${e}`);
    }
  });

  engine.on("parchis:dice_rolled", (eventPayload) => {
    io.to(roomId).emit("parchis:dice_rolled", eventPayload);
  });

  room.users.forEach((u: any) => {
    engine.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "parchis" });
  engine.startGame(rules);
  logger.info(`🎲 Partida de PARCHIS iniciada en la sala ${roomId}`);
}

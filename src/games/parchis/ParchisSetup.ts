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
  room.gameEngine = new ParchisEngine(roomId, async (event: string, eventPayload?: any) => {
    try {
      if (event === "player_won") {
        await handlePlayerWon(roomId, eventPayload, room, io, "parchisWins");
        return;
      }
      if (event === "game_state_update") {
        const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
        if (targetSocketId) io.to(targetSocketId).emit(event, eventPayload.state);
      } else {
        io.to(roomId).emit(event, eventPayload);
      }
    } catch (e) {
      logger.error(`Error emitiendo evento de juego Parchis: ${e}`);
    }
  });

  room.users.forEach((u: any) => {
    room.gameEngine!.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "parchis" });
  room.gameEngine.startGame(rules);
  logger.info(`🎲 Partida de PARCHIS iniciada en la sala ${roomId}`);
}

import type { Server } from "socket.io";
import { LiarsEngine } from "./LiarsEngine.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";

export function setupLiarsGame(roomId: string, room: any, io: Server, roomManager: RoomManager) {
  room.gameType = "liars";
  
  const engine = new LiarsEngine(roomId, io);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      if (eventPayload) {
        await handlePlayerWon(roomId, eventPayload, room, io, "");
      }
    } catch (e) {
      logger.error("Error emitiendo evento de juego Liars (player_won): " + e);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      if (targetSocketId) io.to(targetSocketId).emit("game_state_update", eventPayload.state);
    } catch (e) {
      logger.error("Error emitiendo evento de juego Liars (game_state_update): " + e);
    }
  });

  engine.on("game_action", (eventPayload) => {
    io.to(roomId).emit("game_action", eventPayload);
  });

  engine.on("game_message", (eventPayload) => {
    io.to(roomId).emit("game_message", eventPayload);
  });

  engine.on("return_to_lobby", (eventPayload) => {
    io.to(roomId).emit("return_to_lobby", eventPayload);
  });

  room.users.forEach((u: any) => {
    engine.addPlayer(u.userId, u.socketId, u.nickname, u.avatarId, u.color);
  });

  io.to(roomId).emit("game_started", { gameType: "liars" });
  
  if (roomManager && roomManager.botManager) {
    roomManager.botManager.attachEngineToBots(roomId, engine);
  }

  engine.startGame();
  logger.info(`Partida de LIARS BAR iniciada en la sala ${roomId}`);
}

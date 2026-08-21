import type { Server } from "socket.io";
import { ImpostorEngine } from "./ImpostorEngine.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";

export function setupImpostorGame(roomId: string, room: any, io: Server, roomManager?: RoomManager) {
  room.gameType = "impostor";
  
  const engine = new ImpostorEngine(roomId, io);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      if (eventPayload) {
        await handlePlayerWon(roomId, eventPayload, room, io, "");
      }
    } catch (e) {
      logger.error("Error emitiendo evento de juego Impostor (player_won): " + e);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      if (targetSocketId) io.to(targetSocketId).emit("game_state_update", eventPayload.state);
    } catch (e) {
      logger.error("Error emitiendo evento de juego Impostor (game_state_update): " + e);
    }
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

  if (roomManager && roomManager.botManager) {
    roomManager.botManager.attachEngineToBots(roomId, engine);
  }

  io.to(roomId).emit("game_started", { gameType: "impostor" });
  engine.startGame();
  logger.info(`Partida de IMPOSTOR iniciada en la sala ${roomId}`);
}

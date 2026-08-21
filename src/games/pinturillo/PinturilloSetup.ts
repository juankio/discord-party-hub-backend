import type { Server } from "socket.io";
import { PinturilloEngine } from "./PinturilloEngine.js";
import { handlePlayerWon } from "../../core/WinHandler.js";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";

export function setupPinturilloGame(roomId: string, room: any, io: Server, roomManager?: RoomManager) {
  room.gameType = "pinturillo";
  
  const engine = new PinturilloEngine(roomId, io);
  room.gameEngine = engine;

  engine.on("player_won", async (eventPayload) => {
    try {
      if (eventPayload) {
        await handlePlayerWon(roomId, eventPayload, room, io, "");
      }
    } catch (e) {
      logger.error("Error emitiendo evento de juego Pinturillo (player_won): " + e);
    }
  });

  engine.on("game_state_update", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      if (targetSocketId) io.to(targetSocketId).emit("game_state_update", eventPayload.state);
    } catch (e) {
      logger.error("Error emitiendo evento de juego Pinturillo (game_state_update): " + e);
    }
  });

  engine.on("draw_broadcast", (eventPayload) => {
    io.to(roomId).emit("draw_event", eventPayload);
  });

  engine.on("chat_message", (eventPayload) => {
    io.to(roomId).emit("chat_message", eventPayload);
  });

  engine.on("private_message", (eventPayload) => {
    try {
      const targetSocketId = room.users.find((u: any) => u.userId === eventPayload.targetUserId)?.socketId;
      if (targetSocketId) io.to(targetSocketId).emit("game_message", eventPayload.message);
    } catch (e) {
      logger.error("Error emitiendo private_message: " + e);
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

  io.to(roomId).emit("game_started", { gameType: "pinturillo" });
  engine.startGame();
  logger.info(`Partida de PINTURILLO iniciada en la sala ${roomId}`);
}

import { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { ImpostorEngine } from "./ImpostorEngine.js";

const VoteSchema = z.object({
  targetId: z.string().min(1).max(50),
});

export function registerImpostorRoutes(socket: Socket, roomManager: RoomManager, validateContext: (socket: Socket) => boolean) {
  const rooms = roomManager.getRoomsMap();

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateContext(socket)) return;
      handler();
    } catch (e) {
      logger.error("[ERROR] Unhandled error in Impostor Engine for socket " + socket.id + ": " + e);
    }
  };

  socket.on("request_game_state", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'impostor') {
      room.gameEngine.broadcastState();
    }
  }));

  socket.on("impostor:vote", (payload: any) => wrapHandler(() => {
    const result = VoteSchema.safeParse(payload);
    if (!result.success) {
      logger.warn("[ZOD] Invalid impostor:vote from " + socket.data.userId);
      return;
    }

    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'impostor') {
      (room.gameEngine as ImpostorEngine).vote(socket.data.userId, result.data.targetId);
    }
  }));

  socket.on("impostor:return_to_lobby", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (!room || room.gameType !== 'impostor') return;
    if (room.hostUserId === socket.data.userId) {
      (room.gameEngine as ImpostorEngine).returnToLobby();
      room.gameEngine = undefined;
      room.gameType = undefined;
    }
  }));
}
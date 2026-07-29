import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { LiarsEngine } from "./LiarsEngine.js";

const BidSchema = z.object({
  count: z.number().int().min(1).max(30),
  face: z.number().int().min(1).max(6)
});

export function registerLiarsRoutes(socket: Socket, roomManager: RoomManager, validateContext: (socket: Socket) => boolean) {
  const rooms = roomManager.getRoomsMap();

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Liars Engine for socket ${socket.id}: ${e}`);
    }
  };

  socket.on("liars:place_bid", (payload: any) => wrapHandler(() => {
    const result = BidSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid place_bid from ${socket.data.userId}`);
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'liars') {
      (room.gameEngine as LiarsEngine).placeBid(socket.data.userId, result.data.count, result.data.face);
    }
  }));

  socket.on("liars:call_liar", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'liars') {
      (room.gameEngine as LiarsEngine).callLiar(socket.data.userId);
    }
  }));
}

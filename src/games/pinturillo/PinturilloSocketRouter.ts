import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { PinturilloEngine } from "./PinturilloEngine.js";
import type { DrawEvent } from "./PinturilloTypes.js";

const WordSchema = z.object({
  wordIndex: z.number().int().min(0)
});
const ChatSchema = z.string().min(1).max(200);
// Draw event has arbitrary structure based on type (line, clear, fill, etc.)
const DrawEventSchema = z.any();

export function registerPinturilloRoutes(socket: Socket, roomManager: RoomManager, validateContext: (socket: Socket) => boolean) {
  const rooms = roomManager.getRoomsMap();

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Pinturillo Engine for socket ${socket.id}: ${e}`);
    }
  };

  socket.on("pinturillo:choose_word", (payload: any) => wrapHandler(() => {
    const result = WordSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid choose_word from ${socket.data.userId}`);
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'pinturillo') {
      const engine = room.gameEngine as PinturilloEngine;
      const word = engine.wordChoices[result.data.wordIndex];
      if (word) {
        engine.chooseWord(socket.data.userId, word);
      } else {
        logger.warn(`[Pinturillo] Word index out of bounds for ${socket.data.userId}`);
      }
    }
  }));

  socket.on("pinturillo:draw_event", (payload: any) => wrapHandler(() => {
    const result = DrawEventSchema.safeParse(payload);
    if (!result.success) return;
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'pinturillo') {
      (room.gameEngine as PinturilloEngine).handleDrawEvent(socket.data.userId, result.data as DrawEvent);
    }
  }));

  socket.on("pinturillo:chat", (payload: any) => wrapHandler(() => {
    const result = ChatSchema.safeParse(payload);
    if (!result.success) return;
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'pinturillo') {
      (room.gameEngine as PinturilloEngine).handleChat(socket.data.userId, result.data);
    }
  }));
}

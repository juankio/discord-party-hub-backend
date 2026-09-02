import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { PinturilloEngine } from "./PinturilloEngine.js";
import type { DrawEvent } from "./PinturilloTypes.js";

const WordSchema = z.object({
  wordIndex: z.number().int().min(0)
});
const ChatSchema = z.object({
  text: z.string().min(1).max(200)
});

const DrawDataSchema = z.object({
  x0: z.number().optional(),
  y0: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  points: z.array(z.object({
    x: z.number(),
    y: z.number()
  })).max(500).optional(),
  color: z.string().max(30).optional(),
  thickness: z.number().min(0.1).max(200).optional(),
  size: z.number().min(0.1).max(200).optional()
}).passthrough().optional();

const DrawEventSchema = z.object({
  type: z.enum(['stroke', 'clear', 'undo', 'fill', 'line']),
  data: DrawDataSchema
});

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

  socket.on("request_game_state", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine && room.gameType === 'pinturillo') {
      const engine = room.gameEngine as PinturilloEngine;
      engine.sendFullStateToPlayer(socket.id, socket.data.userId);
    }
  }));

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

  socket.on("pinturillo:draw", (payload: any) => wrapHandler(() => {
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
      (room.gameEngine as PinturilloEngine).handleChat(socket.data.userId, result.data.text);
    }
  }));
}

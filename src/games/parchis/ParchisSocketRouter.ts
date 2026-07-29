import type { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { ParchisEngine } from "./ParchisEngine.js";

const ParchisJoinSchema = z.object({
  roomId: z.string().optional()
}).optional().nullable();

const ParchisChooseFigureSchema = z.object({
  figureId: z.string().max(50)
});

const ParchisChooseSeatSchema = z.object({
  targetColorIndex: z.number().min(0).max(10)
});

const ParchisMoveTokenSchema = z.object({
  tokenId: z.string().max(50),
  diceValue: z.number().min(1).max(6)
});

export function registerParchisRoutes(socket: Socket, roomManager: RoomManager, validate: (s: Socket) => boolean) {
  const getParchisEngine = (): ParchisEngine | undefined => {
    if (!socket.data || !socket.data.roomId) return undefined;
    const room = roomManager.getRoomsMap().get(socket.data.roomId);
    if (!room || room.gameType !== 'parchis' || !room.gameEngine) return undefined;
    return room.gameEngine as ParchisEngine;
  };

  const wrapParchisHandler = (handler: (engine: ParchisEngine) => void) => {
    try {
      if (!validate(socket)) return;
      const engine = getParchisEngine();
      if (!engine) return;
      handler(engine);
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Parchis route for socket ${socket.id}: ${e}`);
    }
  };

  socket.on("parchis:join", (payload: any) => {
    try {
      const result = ParchisJoinSchema.safeParse(payload);
      const roomId = (result.success && result.data?.roomId) ? result.data.roomId : socket.data?.roomId;
      if (!roomId) return;
      
      const room = roomManager.getRoomsMap().get(roomId);
      if (!room) {
        socket.emit("room_not_found");
        return;
      }
      
      if (room.gameType !== 'parchis' || !room.gameEngine) return;
      
      if (!socket.data) socket.data = {};
      if (!socket.data.roomId) socket.data.roomId = roomId;

      if (!validate(socket)) return;

      const engine = room.gameEngine as ParchisEngine;
      engine.broadcastState();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Parchis join for socket ${socket.id}: ${e}`);
    }
  });

  socket.on("parchis:roll_dice", () => wrapParchisHandler((engine) => {
    engine.rollDice(socket.data.userId);
  }));

  socket.on("parchis:choose_figure", (payload: any) => wrapParchisHandler((engine) => {
    const result = ParchisChooseFigureSchema.safeParse(payload);
    if (!result.success) {
      logger.warn("[ZOD] Invalid choose_figure from " + socket.data.userId);
      return;
    }
    engine.chooseFigure(socket.data.userId, result.data.figureId);
  }));

  socket.on("parchis:roll_initiative", () => wrapParchisHandler((engine) => {
    engine.rollInitiative(socket.data.userId);
  }));

  socket.on("parchis:choose_seat", (payload: any) => wrapParchisHandler((engine) => {
    const result = ParchisChooseSeatSchema.safeParse(payload);
    if (!result.success) {
      logger.warn("[ZOD] Invalid choose_seat from " + socket.data.userId);
      return;
    }
    engine.chooseSeat(socket.data.userId, result.data.targetColorIndex);
  }));

  socket.on("parchis:move_token", (payload: any) => wrapParchisHandler((engine) => {
    const result = ParchisMoveTokenSchema.safeParse(payload);
    if (!result.success) {
      logger.warn("[ZOD] Invalid move_token from " + socket.data.userId);
      return;
    }
    engine.moveToken(socket.data.userId, result.data.tokenId, result.data.diceValue);
  }));

  socket.on("parchis:surrender", () => wrapParchisHandler((engine) => {
    engine.surrender(socket.data.userId);
  }));
}

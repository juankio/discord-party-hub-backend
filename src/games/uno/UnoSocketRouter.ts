import { Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";

const UnoPlayCardsSchema = z.array(z.string().max(50)).min(1).max(20);
const StringIdSchema = z.string().max(50);
const ColorSchema = z.enum(["red", "blue", "green", "yellow", "wild"]);
const HoverSchema = z.number().min(0).max(108).nullable();

export function registerUnoRoutes(socket: Socket, roomManager: RoomManager, validateContext: (socket: Socket) => boolean) {
  const rooms = roomManager.getRoomsMap();

  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Uno Engine for socket ${socket.id}: ${e}`);
    }
  };

  socket.on("uno:play_cards", (payload: any) => wrapHandler(() => {
    const result = UnoPlayCardsSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid play_cards from ${socket.data.userId}`);
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.playCards(socket.data.userId, result.data);
  }));

  socket.on("uno:draw_card", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.drawFromDeck(socket.data.userId);
  }));

  socket.on("uno:pass_turn", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.passTurn(socket.data.userId);
  }));

  socket.on("uno:declare_color", (payload: any) => wrapHandler(() => {
    const result = ColorSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid declare_color`);
    
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.declareColor(socket.data.userId, result.data as any);
  }));

  socket.on("uno:swap_hands", (payload: any) => wrapHandler(() => {
    const result = StringIdSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid target ID`);

    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.swapHands(socket.data.userId, result.data);
  }));

  socket.on("uno:yell_uno", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.yellUno(socket.data.userId);
  }));

  socket.on("uno:challenge_uno", (payload: any) => wrapHandler(() => {
    const result = StringIdSchema.safeParse(payload);
    if (!result.success) return logger.warn(`[ZOD] Invalid challenge target`);

    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.challengeUno(socket.data.userId, result.data);
  }));

  socket.on("uno:hover_card", (payload: any) => wrapHandler(() => {
    const result = HoverSchema.safeParse(payload);
    if (!result.success) return;

    socket.to(socket.data.roomId).emit("uno:rival_hover", {
      userId: socket.data.userId,
      index: result.data
    });
  }));

  socket.on("uno:surrender", () => wrapHandler(() => {
    const room = rooms.get(socket.data.roomId);
    if (room?.gameEngine) room.gameEngine.surrender(socket.data.userId);
  }));
}

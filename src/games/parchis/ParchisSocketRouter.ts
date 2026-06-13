import type { Socket } from "socket.io";
import { logger } from "../../core/Logger.js";
import type { RoomManager } from "../../core/RoomManager.js";
import type { ParchisEngine } from "./ParchisEngine.js";

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

  socket.on("parchis:join", () => wrapParchisHandler((engine) => {
    // Already added on start_game, but can broadcast state here
    engine.broadcastState();
  }));

  socket.on("parchis:roll_dice", () => wrapParchisHandler((engine) => {
    engine.rollDice(socket.data.userId);
  }));

  socket.on("parchis:choose_figure", (payload: { figureId: string }) => wrapParchisHandler((engine) => {
    engine.chooseFigure(socket.data.userId, payload.figureId);
  }));

  socket.on("parchis:move_token", (tokenId: string) => wrapParchisHandler((engine) => {
    engine.moveToken(socket.data.userId, tokenId);
  }));
}
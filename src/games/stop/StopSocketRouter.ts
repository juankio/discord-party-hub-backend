import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { RoomManager } from '../../core/RoomManager.js';
import { logger } from '../../core/Logger.js';

const StopCallSchema = z.object({
  answers: z.record(z.string(), z.string())
});
const StopSubmitSchema = z.object({
  answers: z.record(z.string(), z.string())
});
const StopVoteVetoSchema = z.object({
  category: z.string(),
  targetId: z.string()
});
const StopConfigSchema = z.object({
  categories: z.array(z.string()).min(3).max(12),
  rounds: z.number().min(1).max(10)
});

export function registerStopRoutes(socket: Socket, roomManager: RoomManager, validateSocketContext: (s: Socket) => boolean) {
  const wrapHandler = (handler: () => void) => {
    try {
      if (!validateSocketContext(socket)) return;
      handler();
    } catch (e) {
      logger.error(`[ERROR] Unhandled error in Stop Engine for socket ${socket.id}: ${e}`);
    }
  };

  const getStopEngine = () => {
    const roomId = socket.data.roomId;
    if (!roomId) return null;
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameType !== 'stop' || !room.gameEngine) return null;
    return room.gameEngine as any;
  };

  socket.on('stop:join', () => wrapHandler(() => {
    const engine = getStopEngine();
    if (!engine) return;
    engine.broadcastState(); // Force sync state for the joining player
  }));

  socket.on('stop:update_config', (payload: any) => wrapHandler(() => {
    const result = StopConfigSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host
    engine.rules = result.data;
    engine.broadcastState();
  }));

  socket.on('stop:start_game', (payload: any) => wrapHandler(() => {
    const result = StopConfigSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host
    engine.rules = result.data;
    engine.startGame(engine.rules, room?.lastWinnerUserId);
  }));

  socket.on('stop:call_stop', (payload: any) => wrapHandler(() => {
    const result = StopCallSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.stopCall(socket.data.userId, result.data.answers);
  }));

  socket.on('stop:submit_answers', (payload: any) => wrapHandler(() => {
    const result = StopSubmitSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.submitAnswers(socket.data.userId, result.data.answers);
  }));

  socket.on('stop:cast_veto', (payload: any) => wrapHandler(() => {
    const result = StopVoteVetoSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.voteVeto(socket.data.userId, result.data.category, result.data.targetId);
  }));

  socket.on('stop:finish_verification', () => wrapHandler(() => {
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host
    engine.finishVerifyingAndScore();
  }));

  socket.on('stop:next_round', () => wrapHandler(() => {
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host
    engine.nextRound();
  }));

  socket.on('stop:back_to_lobby', () => wrapHandler(() => {
    const room = roomManager.getRoom(socket.data.roomId);
    if (!room) return;
    if (room.hostUserId === socket.data.userId) {
      room.gameEngine = undefined;
      room.gameType = undefined;
      const io = (roomManager as any).io;
      io.to(socket.data.roomId).emit("return_to_lobby");
    }
  }));
}

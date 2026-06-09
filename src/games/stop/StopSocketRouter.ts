import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { RoomManager } from '../../core/RoomManager.js';
import { logger } from '../../core/Logger.js';

const StopCallSchema = z.record(z.string(), z.string()); // Record of category -> answer
const StopSubmitSchema = z.record(z.string(), z.string());
const StopVoteVetoSchema = z.object({
  category: z.string(),
  targetUserId: z.string()
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
    return room.gameEngine as any; // Cast as any because RoomData typing in RoomManager doesn't explicitly have StopEngine yet, but we will fix that or ignore.
  };

  socket.on('stop_call', (payload: any) => wrapHandler(() => {
    const result = StopCallSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.stopCall(socket.data.userId, result.data);
  }));

  socket.on('stop_submit', (payload: any) => wrapHandler(() => {
    const result = StopSubmitSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.submitAnswers(socket.data.userId, result.data);
  }));

  socket.on('stop_vote_veto', (payload: any) => wrapHandler(() => {
    const result = StopVoteVetoSchema.safeParse(payload);
    if (!result.success) return;
    const engine = getStopEngine();
    if (!engine) return;
    engine.voteVeto(socket.data.userId, result.data.category, result.data.targetUserId);
  }));

  socket.on('stop_finish_verifying', () => wrapHandler(() => {
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host can finish verifying
    engine.finishVerifyingAndScore();
  }));

  socket.on('stop_next_round', () => wrapHandler(() => {
    const engine = getStopEngine();
    if (!engine) return;
    const room = roomManager.getRoom(socket.data.roomId);
    if (room?.hostUserId !== socket.data.userId) return; // Only host can next round
    engine.nextRound();
  }));
}

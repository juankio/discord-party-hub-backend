import type { Server, Socket } from 'socket.io';
import { logger } from './Logger.js';
import { z } from 'zod';
import type { RoomManager } from './RoomManager.js';

const AddBotsSchema = z.object({
  roomId: z.string().min(1).max(50),
  count: z.number().int().min(1).max(7),
  difficulty: z.number().int().min(1).max(10)
});

const UpdateBotConfigSchema = z.object({
  botId: z.string().min(1),
  difficulty: z.number().int().min(1).max(10).optional(),
  nickname: z.string().max(30).optional(),
  avatarId: z.number().int().optional(),
  color: z.string().max(20).optional()
});

const KickBotSchema = z.object({
  botId: z.string().min(1)
});

const KickPlayerSchema = z.object({
  userId: z.string().min(1)
});

const UpdateRoomRulesSchema = z.record(z.string(), z.any());

const ChangeSeatSchema = z.object({
  targetSeatIndex: z.number().int().min(0).max(7)
});

export class RoomSettingsHandler {
  constructor(private io: Server, private manager: RoomManager) {}

  public handleAddBots(socket: Socket, data: any) {
    const result = AddBotsSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid add_bots payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { roomId, count, difficulty } = result.data;
    const room = this.manager.getRoom(roomId);
    if (!room) {
      this.io.to(socket.id).emit("room_not_found");
      return;
    }

    if (room.hostUserId !== socket.data?.userId) {
      logger.warn(`[SECURITY] Non-host user ${socket.data?.userId} tried to add bots to room ${roomId}`);
      return;
    }

    this.manager.botManager.addBotsToRoom(roomId, count, difficulty);
  }

  public handleUpdateBotConfig(socket: Socket, data: any) {
    const result = UpdateBotConfigSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid update_bot_config payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { botId, ...configData } = result.data;
    const roomId = socket.data?.roomId;
    if (!roomId) return;

    const room = this.manager.getRoom(roomId);
    if (!room) return;

    if (room.hostUserId !== socket.data?.userId) {
      logger.warn(`[SECURITY] Non-host user ${socket.data?.userId} tried to update bot ${botId} in room ${roomId}`);
      return;
    }

    this.manager.botManager.updateBotConfig(botId, roomId, configData);
  }

  public handleKickBot(socket: Socket, data: any) {
    const result = KickBotSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid kick_bot payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { botId } = result.data;
    const roomId = socket.data?.roomId;
    if (!roomId) return;

    const room = this.manager.getRoom(roomId);
    if (!room) return;

    if (room.hostUserId !== socket.data?.userId) {
      logger.warn(`[SECURITY] Non-host user ${socket.data?.userId} tried to kick bot ${botId} in room ${roomId}`);
      return;
    }

    this.manager.botManager.removeBot(botId, roomId);
  }

  public handleKickPlayer(socket: Socket, data: any) {
    const result = KickPlayerSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid kick_player payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { userId } = result.data;
    const roomId = socket.data?.roomId;
    if (!roomId) return;

    const room = this.manager.getRoom(roomId);
    if (!room) return;

    if (room.hostUserId !== socket.data?.userId) {
      logger.warn(`[SECURITY] Non-host user ${socket.data?.userId} tried to kick player ${userId} in room ${roomId}`);
      return;
    }

    if (userId === room.hostUserId) {
       return;
    }

    const userToKick = room.users.find(u => u.userId === userId);
    if (userToKick) {
      this.io.to(userToKick.socketId).emit("kicked_from_room");
      this.io.sockets.sockets.get(userToKick.socketId)?.leave(roomId);
      
      room.users = room.users.filter(u => u.userId !== userId);
      if (room.gameEngine) room.gameEngine.removePlayer(userId);
      this.manager.recomputeNicknames(room, roomId);
    }
  }

  public handleChangeSeat(socket: Socket, data: any) {
    if (!socket.data || !socket.data.roomId || !socket.data.userId) {
      logger.warn(`[SECURITY] Action blocked without auth on socket: ${socket.id}`);
      return;
    }

    const result = ChangeSeatSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid change_seat payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { targetSeatIndex } = result.data;
    const roomId = socket.data.roomId;
    const userId = socket.data.userId;

    const room = this.manager.getRoom(roomId);
    if (!room) return;

    // Check if the target seat is occupied
    const isOccupied = room.users.some(u => u.seatIndex === targetSeatIndex);
    if (isOccupied) {
      logger.warn(`[LOGIC] User ${userId} tried to take occupied seat ${targetSeatIndex} in room ${roomId}`);
      return;
    }

    const currentUser = room.users.find(u => u.userId === userId);
    if (currentUser) {
      currentUser.seatIndex = targetSeatIndex;
      this.manager.broadcastRoomUpdate(roomId);
    }
  }

  public handleUpdateRoomRules(socket: Socket, data: any) {
    if (!socket.data || !socket.data.roomId || !socket.data.userId) {
      logger.warn(`[SECURITY] Action blocked without auth on socket: ${socket.id}`);
      return;
    }

    const result = UpdateRoomRulesSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[ZOD] Invalid update_room_rules payload from ${socket.data.userId}: ${JSON.stringify(result.error)}`);
      return;
    }
    
    const roomId = socket.data.roomId;
    const room = this.manager.getRoom(roomId);
    if (!room || room.hostUserId !== socket.data.userId) return;

    room.roomRules = result.data;
    this.io.to(roomId).emit("room_update", {
      users: room.users, hostUserId: room.hostUserId, roomRules: room.roomRules, selectedGame: room.selectedGame
    });
  }
}

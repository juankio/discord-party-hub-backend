import type { Server, Socket } from 'socket.io';
import { logger } from './Logger.js';
import { z } from 'zod';
import type { RoomManager } from './RoomManager.js';

const JoinRoomSchema = z.object({
  roomId: z.string().min(1).max(50),
  userId: z.string().min(1).max(50),
  nickname: z.string().max(30).default('Anon'),
  avatarId: z.number().int().default(1),
  color: z.string().max(20).default('#ffffff'),
  totalWins: z.number().default(0)
});

const UpdateProfileSchema = z.object({
  nickname: z.string().max(30).default('Anon'),
  avatarId: z.number().int().default(1),
  color: z.string().max(20).default('#ffffff')
});

export class RoomJoinHandler {
  constructor(private io: Server, private manager: RoomManager, private disconnectTimers: Map<string, NodeJS.Timeout>) {}

  public handleJoin(socket: Socket, data: any) {
    const result = JoinRoomSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid join_room payload: ${result.error.issues[0]?.message}`);
      return;
    }

    const { roomId, userId, nickname, avatarId, color, totalWins } = result.data;
    socket.join(roomId);
    socket.data = { userId, nickname, avatarId, color, roomId, totalWins };

    const timeoutKey = `${roomId}_${userId}`;
    const existingTimer = this.disconnectTimers.get(timeoutKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.disconnectTimers.delete(timeoutKey);
    }

    const room = this.manager.getRoom(roomId);
    if (!room) {
      this.io.to(socket.id).emit("room_not_found");
      return;
    }

    room.lastActive = Date.now();
    const existingIndex = room.users.findIndex(u => u.userId === userId);

    if (existingIndex === -1) {
      const maxPlayers = room.roomRules?.extendedLobby ? 8 : 6;
      if (room.users.length >= maxPlayers) {
        this.io.to(socket.id).emit("room_full");
        return;
      }
      let freeSeat = 0;
      for (let i = 0; i < 8; i++) {
        if (!room.users.some(u => u.seatIndex === i)) {
          freeSeat = i;
          break;
        }
      }
      room.users.push({ socketId: socket.id, userId, originalNickname: nickname, nickname, avatarId, color, totalWins, seatIndex: freeSeat, isOffline: false });
    } else {
      const prevSeat = room.users[existingIndex].seatIndex;
      room.users[existingIndex] = { socketId: socket.id, userId, originalNickname: nickname, nickname, avatarId, color, totalWins, seatIndex: prevSeat, isOffline: false };
    }

    const hostStillExists = room.users.some(u => u.userId === room.hostUserId);
    if (!hostStillExists && room.users.length > 0) {
      const firstRealPlayer = room.users.find(u => !u.isBot);
      room.hostUserId = firstRealPlayer ? firstRealPlayer.userId : room.users[0]!.userId;
      logger.info(`Host migrated to ${room.hostUserId} in room ${roomId}`);
    }

    if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
      room.gameEngine.setPlayerOffline(userId, false);
      room.gameEngine.addPlayer(userId, socket.id, nickname, avatarId, color);
      this.io.to(socket.id).emit("game_started", { gameType: room.gameType });
      if (room.gameType !== 'stop') {
          room.gameEngine.broadcastState();
      }
    } else {
      this.io.to(socket.id).emit("return_to_lobby");
    }

    this.manager.recomputeNicknames(room, roomId);
  }

  public handleUpdateProfile(socket: Socket, data: any) {
    const result = UpdateProfileSchema.safeParse(data);
    if (!result.success) return;

    const { nickname, avatarId, color } = result.data;
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;
    const room = roomId ? this.manager.getRoom(roomId) : undefined;
    if (!room || !userId) return;

    room.lastActive = Date.now();
    const currentUser = room.users.find(u => u.userId === userId);
    if (!currentUser) return;

    currentUser.originalNickname = nickname;
    currentUser.avatarId = avatarId;
    currentUser.color = color;
    socket.data.avatarId = avatarId;
    socket.data.color = color;

    if (room.gameEngine && ['uno', 'stop', 'parchis'].includes(room.gameType || '')) {
      const p = room.gameEngine.players.find((player: any) => player.userId === userId);
      if (p) {
        p.avatarId = avatarId;
        p.color = color;
      }
    }
    this.manager.recomputeNicknames(room, roomId);
  }

  public handleExplicitLeave(socket: Socket) {
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;
    const room = roomId ? this.manager.getRoom(roomId) : undefined;
    if (!room || !userId) return;

    const timeoutKey = `${roomId}_${userId}`;
    const existingTimer = this.disconnectTimers.get(timeoutKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.disconnectTimers.delete(timeoutKey);
    }

    room.users = room.users.filter(u => u.userId !== userId);
    if (room.gameEngine) room.gameEngine.removePlayer(userId);

    const hasRealPlayers = room.users.some(u => !u.isBot);

    if (room.users.length === 0 || !hasRealPlayers) {
      this.manager.deleteRoom(roomId);
    } else {
      if (room.hostUserId === userId) {
        const firstRealPlayer = room.users.find(u => !u.isBot);
        if (firstRealPlayer) {
          room.hostUserId = firstRealPlayer.userId;
        }
      }
      this.manager.recomputeNicknames(room, roomId);
    }
    socket.leave(roomId);
    socket.data = {};
  }

  public handleDisconnect(socket: Socket) {
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;
    const room = roomId ? this.manager.getRoom(roomId) : undefined;
    if (!room || !userId) return;

    const currentUser = room.users.find(u => u.userId === userId);
    if (currentUser) {
      currentUser.isOffline = true;
      if (room.gameEngine) room.gameEngine.setPlayerOffline(userId, true);
      this.manager.recomputeNicknames(room, roomId);
    }

    const timeoutKey = `${roomId}_${userId}`;
    const timerId = setTimeout(() => {
      this.disconnectTimers.delete(timeoutKey);
      const currentRoom = this.manager.getRoom(roomId);
      if (!currentRoom) return;
      const u = currentRoom.users.find(x => x.userId === userId);
      if (u && u.socketId === socket.id) {
        currentRoom.users = currentRoom.users.filter(x => x.userId !== userId);
        if (currentRoom.gameEngine) currentRoom.gameEngine.removePlayer(userId);

        const hasRealPlayers = currentRoom.users.some(usr => !usr.isBot);

        if (currentRoom.users.length === 0 || !hasRealPlayers) {
          this.manager.deleteRoom(roomId);
        } else {
          if (currentRoom.hostUserId === userId) {
            const firstRealPlayer = currentRoom.users.find(usr => !usr.isBot);
            if (firstRealPlayer) {
              currentRoom.hostUserId = firstRealPlayer.userId;
            }
          }
          this.manager.recomputeNicknames(currentRoom, roomId);
        }
      }
    }, 30000);
    this.disconnectTimers.set(timeoutKey, timerId);
  }
}

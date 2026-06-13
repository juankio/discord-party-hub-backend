import type { Server, Socket } from 'socket.io';
import { logger } from './Logger.js';
import type { UnoEngine } from '../games/uno/UnoEngine.js';
import type { ImpostorEngine } from '../games/impostor/ImpostorEngine.js';
import type { StopEngine } from '../games/stop/StopEngine.js';
import { z } from 'zod';
import { RoomGarbageCollector } from './RoomGarbageCollector.js';

const JoinRoomSchema = z.object({
  roomId: z.string().min(1).max(50),
  userId: z.string().min(1).max(50),
  nickname: z.string().max(30).default('Anon'),
  avatarId: z.number().int().default(1),
  color: z.string().max(20).default('#ffffff'),
  tokenType: z.string().max(20).default('gem'),
  totalWins: z.number().default(0)
});

const UpdateProfileSchema = z.object({
  nickname: z.string().max(30).default('Anon'),
  avatarId: z.number().int().default(1),
  color: z.string().max(20).default('#ffffff'),
  tokenType: z.string().max(20).default('gem')
});

export interface RoomData {
  users: Array<{
    socketId: string;
    userId: string;
    nickname: string;
    originalNickname: string;
    avatarId: number;
    color: string;
    tokenType?: string;
    totalWins: number;
    isOffline?: boolean;
  }>;
  hostUserId: string;
  gameEngine?: UnoEngine | ImpostorEngine | StopEngine | any;
  gameType?: string;
  roomRules?: Record<string, boolean>;
  selectedGame?: string;
  lastWinnerUserId?: string;
  lastActive: number;
}

export class RoomManager {
  private rooms = new Map<string, RoomData>();
  private io: Server;
  private gc: RoomGarbageCollector;

  constructor(io: Server) {
    this.io = io;
    this.gc = new RoomGarbageCollector(this.rooms, this.io);
    this.gc.start();
  }

  public createRoom(hostUserId: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for(let i=0;i<5;i++) roomId+=chars.charAt(Math.floor(Math.random()*chars.length));
    this.rooms.set(roomId, {
      users: [],
      hostUserId,
      lastActive: Date.now(),
      selectedGame: 'uno',
      roomRules: { stackDrawCards: true, playMultipleSame: true, zeroAndSevenRules: true, drawUntilPlayable: false, interceptExact: false, extendedLobby: false }
    });
    logger.info("Sala oficial creada vía API: " + roomId);
    return roomId;
  }

  public getRoom(roomId: string): RoomData | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomsMap() {
    return this.rooms; // Temp escape hatch for dispatchers
  }

  private recomputeNicknames(room: RoomData, roomId: string) {
    const nameCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();

    for (const user of room.users) {
      colorCounts.set(user.color, (colorCounts.get(user.color) || 0) + 1);
    }

    for (const user of room.users) {
      const originalName = user.originalNickname;
      let count = nameCounts.get(originalName) || 0;
      
      let newName = originalName;
      if (count > 0) {
        newName = `${originalName} (copión ${count})`;
      }
      nameCounts.set(originalName, count + 1);

      if ((colorCounts.get(user.color) || 0) > 1) {
        newName += " (novios hp)";
      }

      user.nickname = newName;

      // Update socket data
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.data.nickname = newName;
      }

      if (room.gameEngine) {
        const p = room.gameEngine.players.find((player: any) => player.userId === user.userId);
        if (p) {
          p.nickname = newName;
        }
      }
    }

    this.io.to(roomId).emit("room_update", {
      users: room.users,
      hostUserId: room.hostUserId,
      roomRules: room.roomRules,
      selectedGame: room.selectedGame
    });

    if (room.gameEngine) {
      room.gameEngine.broadcastState();
    }
  }

  public handleJoin(socket: Socket, data: any) {
    const result = JoinRoomSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid join_room payload from socket: ${socket.id} - ${result.error.issues[0]?.message}`);
      return;
    }

    const { roomId, userId, nickname, avatarId, color, tokenType, totalWins } = result.data;

    socket.join(roomId);
    socket.data = { userId, nickname, avatarId, color, tokenType, roomId, totalWins };

    if (!this.rooms.has(roomId)) {
      this.io.to(socket.id).emit("room_not_found");
      return;
    }

    const room = this.rooms.get(roomId)!;
    room.lastActive = Date.now();

    const existingIndex = room.users.findIndex(u => u.userId === userId);

    if (existingIndex === -1) {
      const maxPlayers = room.roomRules?.extendedLobby ? 8 : 6;
      if (room.users.length >= maxPlayers) {
        this.io.to(socket.id).emit("room_full");
        return;
      }
    }

    if (existingIndex === -1) {
      room.users.push({ socketId: socket.id, userId, originalNickname: nickname, nickname, avatarId, color, tokenType, totalWins, isOffline: false });
    } else {
      room.users[existingIndex] = { socketId: socket.id, userId, originalNickname: nickname, nickname, avatarId, color, tokenType, totalWins, isOffline: false };
    }

    const hostStillExists = room.users.some(u => u.userId === room.hostUserId);
    if (!hostStillExists && room.users.length > 0) {
      room.hostUserId = room.users[0]!.userId;
      logger.info(`Host migrated to ${room.hostUserId} in room ${roomId}`);
    }

    if (room.gameEngine && (room.gameType === 'uno' || room.gameType === 'stop')) {
      room.gameEngine.setPlayerOffline(userId, false);
      (room.gameEngine as UnoEngine).addPlayer(userId, socket.id, nickname, avatarId, color);
      this.io.to(socket.id).emit("game_started", { gameType: room.gameType });
      if (room.gameType === 'uno') {
          (room.gameEngine as UnoEngine).broadcastState();
      }
    } else {
      this.io.to(socket.id).emit("return_to_lobby");
    }

    this.recomputeNicknames(room, roomId);
  }

  public handleUpdateProfile(socket: Socket, data: any) {
    const result = UpdateProfileSchema.safeParse(data);
    if (!result.success) {
      logger.warn(`[SECURITY] Invalid update_profile payload from socket: ${socket.id} - ${result.error.issues[0]?.message}`);
      return;
    }

    const { nickname, avatarId, color, tokenType } = result.data;
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;

    if (!roomId || !userId || !this.rooms.has(roomId)) return;

    const room = this.rooms.get(roomId)!;
    room.lastActive = Date.now();

    const currentUser = room.users.find(u => u.userId === userId);
    if (!currentUser) return;

    currentUser.originalNickname = nickname;
    currentUser.avatarId = avatarId;
    currentUser.color = color;
    currentUser.tokenType = tokenType;

    socket.data.avatarId = avatarId;
    socket.data.color = color;
    socket.data.tokenType = tokenType;

    if (room.gameEngine && (room.gameType === 'uno' || room.gameType === 'stop')) {
      const p = room.gameEngine.players.find((player: any) => player.userId === userId);
      if (p) {
        p.avatarId = avatarId;
        p.color = color;
      }
    }

    this.recomputeNicknames(room, roomId);
  }

  public handleExplicitLeave(socket: Socket) {
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;

    if (!roomId || !this.rooms.has(roomId)) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.users = room.users.filter(u => u.userId !== userId);
    
    if (room.gameEngine) room.gameEngine.removePlayer(userId);

    if (room.users.length === 0) {
      this.rooms.delete(roomId);
      logger.info(`Room ${roomId} destroyed explicitly.`);
    } else {
      if (room.hostUserId === userId) {
        room.hostUserId = room.users[0]!.userId;
        logger.info(`Host left explicitly, migrated to ${room.hostUserId}`);
      }
      this.recomputeNicknames(room, roomId);
    }
    
    socket.leave(roomId);
    socket.data = {};
  }

  public handleDisconnect(socket: Socket) {
    const roomId = socket.data?.roomId;
    const userId = socket.data?.userId;

    if (!roomId || !this.rooms.has(roomId)) return;

    const room = this.rooms.get(roomId);
    if (room) {
      const currentUser = room.users.find(u => u.userId === userId);
      if (currentUser) {
        currentUser.isOffline = true;
        if (room.gameEngine && (room.gameType === 'uno' || room.gameType === 'stop')) {
          room.gameEngine.setPlayerOffline(userId, true);
        } else if (room.gameEngine && room.gameType === 'impostor') {
          room.gameEngine.setPlayerOffline(userId, true);
        }
        this.recomputeNicknames(room, roomId);
      }
    }

    // Grace period
    setTimeout(() => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const currentUser = room.users.find(u => u.userId === userId);
      
      // Si no ha vuelto con otro socket
      if (currentUser && currentUser.socketId === socket.id) {
        room.users = room.users.filter(u => u.userId !== userId);
        
        if (room.gameEngine) room.gameEngine.removePlayer(userId);

        if (room.users.length === 0) {
          logger.info(`Room ${roomId} marked empty (Garbage Collector will clean it soon).`);
        } else {
          if (room.hostUserId === userId) {
            room.hostUserId = room.users[0]!.userId;
            logger.info(`Host left, migrated to ${room.hostUserId} in room ${roomId}`);
          }
          this.recomputeNicknames(room, roomId);
        }
      }
    }, 30000);
  }
}

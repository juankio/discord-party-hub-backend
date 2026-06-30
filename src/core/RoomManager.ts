import type { Server, Socket } from 'socket.io';
import { logger } from './Logger.js';
import type { UnoEngine } from '../games/uno/UnoEngine.js';
import type { ImpostorEngine } from '../games/impostor/ImpostorEngine.js';
import type { StopEngine } from '../games/stop/StopEngine.js';
import { RoomGarbageCollector } from './RoomGarbageCollector.js';
import { RoomConnectionHandler } from './RoomConnectionHandler.js';
import { BotManager } from './bots/BotManager.js';

export interface RoomData {
  users: Array<{
    socketId: string;
    userId: string;
    nickname: string;
    originalNickname: string;
    avatarId: number;
    color: string;
    totalWins: number;
    isOffline?: boolean;
    isBot?: boolean;
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
  private connectionHandler: RoomConnectionHandler;
  public botManager: BotManager;

  constructor(io: Server) {
    this.io = io;
    this.gc = new RoomGarbageCollector(this.rooms, this.io);
    this.gc.start();
    this.connectionHandler = new RoomConnectionHandler(this.io, this);
    this.botManager = new BotManager(this);
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

  public deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
    if (this.botManager) {
      this.botManager.removeBotsFromRoom(roomId);
    }
    logger.info(`Room ${roomId} destroyed.`);
  }

  public getRoomsMap() {
    return this.rooms; 
  }

  public recomputeNicknames(room: RoomData, roomId: string) {
    const nameCounts = new Map<string, number>();
    const colorCounts = new Map<string, number>();

    for (const user of room.users) {
      colorCounts.set(user.color, (colorCounts.get(user.color) || 0) + 1);
    }

    for (const user of room.users) {
      const originalName = user.originalNickname;
      let count = nameCounts.get(originalName) || 0;
      
      let newName = originalName;
      if (room.roomRules?.autoNicknames !== false && count > 0) newName = `${originalName} (copión ${count})`;
      nameCounts.set(originalName, count + 1);

      if (room.roomRules?.autoNicknames !== false && (colorCounts.get(user.color) || 0) > 1) newName += " (novios hp)";

      user.nickname = newName;

      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) socket.data.nickname = newName;

      if (room.gameEngine) {
        const p = room.gameEngine.players.find((player: any) => player.userId === user.userId);
        if (p) p.nickname = newName;
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
    this.connectionHandler.handleJoin(socket, data);
  }

  public handleUpdateProfile(socket: Socket, data: any) {
    this.connectionHandler.handleUpdateProfile(socket, data);
  }

  public handleExplicitLeave(socket: Socket) {
    this.connectionHandler.handleExplicitLeave(socket);
  }

  public handleDisconnect(socket: Socket) {
    this.connectionHandler.handleDisconnect(socket);
  }

  public handleAddBots(socket: Socket, data: any) {
    this.connectionHandler.handleAddBots(socket, data);
  }

  public handleUpdateBotConfig(socket: Socket, data: any) {
    this.connectionHandler.handleUpdateBotConfig(socket, data);
  }

  public handleKickBot(socket: Socket, data: any) {
    this.connectionHandler.handleKickBot(socket, data);
  }
}

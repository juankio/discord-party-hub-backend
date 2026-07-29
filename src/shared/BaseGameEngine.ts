import { EventEmitter } from 'events';
import type { Server } from 'socket.io';

export interface BasePlayer {
  userId: string;
  socketId: string;
  nickname: string;
  avatarId: number;
  color: string;
  isOffline?: boolean;
}

export abstract class BaseGameEngine<TPlayer extends BasePlayer> extends EventEmitter {
  public roomId: string;
  public io: Server;
  public players: TPlayer[] = [];
  public winner: string | null = null; // Can be overridden/casted by games if needed

  constructor(roomId: string, io: Server) {
    super();
    this.roomId = roomId;
    this.io = io;
  }

  public getPlayer(userId: string): TPlayer | undefined {
    return this.players.find(p => p.userId === userId);
  }

  public handlePlayerDisconnect(userId: string): void {
    const player = this.getPlayer(userId);
    if (player) {
      player.isOffline = true;
      this.autoPlayOfflinePlayer(userId);
      this.broadcastState();
    }
  }

  public setPlayerOffline(userId: string, isOffline: boolean): void {
    const player = this.getPlayer(userId);
    if (player) {
      player.isOffline = isOffline;
      if (isOffline) {
        this.autoPlayOfflinePlayer(userId);
      }
      this.broadcastState();
    }
  }

  public broadcastMessage(message: string): void {
    this.emit("game_message", { message });
  }

  public broadcastAction(action: string, userId: string, payload: any = {}): void {
    this.emit("game_action", { action, userId, ...payload });
  }

  public destroy(): void {
    this.removeAllListeners();
  }

  public abstract broadcastState(): void;

  public autoPlayOfflinePlayer(userId: string): void {
    // Default empty implementation, can be overridden by child classes
  }
}

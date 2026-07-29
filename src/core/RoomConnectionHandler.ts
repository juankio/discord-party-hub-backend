import type { Server, Socket } from 'socket.io';
import type { RoomManager } from './RoomManager.js';
import { RoomJoinHandler } from './RoomJoinHandler.js';
import { RoomSettingsHandler } from './RoomSettingsHandler.js';

export class RoomConnectionHandler {
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private joinHandler: RoomJoinHandler;
  private settingsHandler: RoomSettingsHandler;

  constructor(private io: Server, private manager: RoomManager) {
    this.joinHandler = new RoomJoinHandler(this.io, this.manager, this.disconnectTimers);
    this.settingsHandler = new RoomSettingsHandler(this.io, this.manager);
  }

  // --- Join / Connection Methods ---
  public handleJoin(socket: Socket, data: any) {
    this.joinHandler.handleJoin(socket, data);
  }

  public handleUpdateProfile(socket: Socket, data: any) {
    this.joinHandler.handleUpdateProfile(socket, data);
  }

  public handleExplicitLeave(socket: Socket) {
    this.joinHandler.handleExplicitLeave(socket);
  }

  public handleDisconnect(socket: Socket) {
    this.joinHandler.handleDisconnect(socket);
  }

  // --- Settings / Bots / Kick Methods ---
  public handleChangeSeat(socket: Socket, data: any) {
    this.settingsHandler.handleChangeSeat(socket, data);
  }

  public handleAddBots(socket: Socket, data: any) {
    this.settingsHandler.handleAddBots(socket, data);
  }

  public handleUpdateBotConfig(socket: Socket, data: any) {
    this.settingsHandler.handleUpdateBotConfig(socket, data);
  }

  public handleKickBot(socket: Socket, data: any) {
    this.settingsHandler.handleKickBot(socket, data);
  }

  public handleKickPlayer(socket: Socket, data: any) {
    this.settingsHandler.handleKickPlayer(socket, data);
  }

  public handleUpdateRoomRules(socket: Socket, data: any) {
    this.settingsHandler.handleUpdateRoomRules(socket, data);
  }
}

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { RoomJoinHandler } from './RoomJoinHandler.js';
import { RoomManager } from './RoomManager.js';

interface EmittedEvent {
  target: string;
  event: string;
  data?: any;
}

describe('RoomJoinHandler - Active Game Join & Reconnection Flows', () => {
  let emitted: EmittedEvent[];
  let mockIo: any;
  let manager: RoomManager;
  let disconnectTimers: Map<string, NodeJS.Timeout>;
  let handler: RoomJoinHandler;

  beforeEach(() => {
    emitted = [];
    mockIo = {
      to: (target: string) => ({
        emit: (event: string, data?: any) => {
          emitted.push({ target, event, data });
        }
      }),
      sockets: {
        sockets: new Map()
      }
    };
    manager = new RoomManager(mockIo);
    disconnectTimers = new Map();
    handler = new RoomJoinHandler(mockIo, manager, disconnectTimers);
  });

  afterEach(() => {
    if ((manager as any).gc?.stop) {
      (manager as any).gc.stop();
    }
  });

  it('a) Cuando un jugador activo se reconecta (mismo userId en engine.players), recibe game_started y estado completo', () => {
    const roomId = manager.createRoom('active-host-1');
    const room = manager.getRoom(roomId)!;

    const mockGameEngine: any = {
      players: [
        { userId: 'active-user-1', name: 'Luffy', isOffline: true },
        { userId: 'active-user-2', name: 'Zoro', isOffline: false }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      sendFullStateToPlayer: mock((socketId: string, userId: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'uno';
    room.gameEngine = mockGameEngine;

    // Room previously had active-user-1
    room.users.push({
      socketId: 'old-socket-active',
      userId: 'active-user-1',
      originalNickname: 'Luffy',
      nickname: 'Luffy',
      avatarId: 1,
      color: '#ff0000',
      totalWins: 5,
      seatIndex: 0,
      isOffline: true
    });

    const reconnectSocket: any = {
      id: 'new-socket-active-99',
      join: mock((r: string) => {}),
      data: {}
    };

    handler.handleJoin(reconnectSocket, {
      roomId,
      userId: 'active-user-1',
      nickname: 'Luffy',
      avatarId: 1,
      color: '#ff0000',
      totalWins: 5
    });

    // Validations for reconnecting active player:
    // 1. Receives game_started with matching gameType
    const gameStartedEvent = emitted.find(e => e.target === 'new-socket-active-99' && e.event === 'game_started');
    expect(gameStartedEvent).toBeDefined();
    expect(gameStartedEvent?.data).toEqual({ gameType: 'uno' });

    // 2. Does NOT receive game_in_progress
    const gameInProgressEvent = emitted.find(e => e.target === 'new-socket-active-99' && e.event === 'game_in_progress');
    expect(gameInProgressEvent).toBeUndefined();

    // 3. Engine hooks called correctly
    expect(mockGameEngine.setPlayerOffline).toHaveBeenCalledWith('active-user-1', false);
    expect(mockGameEngine.addPlayer).toHaveBeenCalledWith('active-user-1', 'new-socket-active-99', 'Luffy', 1, '#ff0000');
    expect(mockGameEngine.sendFullStateToPlayer).toHaveBeenCalledWith('new-socket-active-99', 'active-user-1');
    expect(mockGameEngine.broadcastState).toHaveBeenCalled();

    // 4. Room user offline status restored
    const userInRoom = room.users.find(u => u.userId === 'active-user-1');
    expect(userInRoom?.isOffline).toBe(false);
    expect(userInRoom?.socketId).toBe('new-socket-active-99');
  });

  it('b) Cuando un jugador NUEVO entra mientras isGameActive, NO recibe game_started, sino return_to_lobby y game_in_progress', () => {
    const roomId = manager.createRoom('host-chopper');
    const room = manager.getRoom(roomId)!;

    const mockGameEngine: any = {
      players: [
        { userId: 'host-chopper', name: 'Chopper' },
        { userId: 'player-sanji', name: 'Sanji' }
      ],
      setPlayerOffline: mock(() => {}),
      addPlayer: mock(() => {}),
      sendFullStateToPlayer: mock(() => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'stop';
    room.gameEngine = mockGameEngine;

    const newPlayerSocket: any = {
      id: 'socket-usopp-sniper-77',
      join: mock((r: string) => {}),
      data: {}
    };

    handler.handleJoin(newPlayerSocket, {
      roomId,
      userId: 'new-user-usopp',
      nickname: 'Usopp',
      avatarId: 3,
      color: '#eab308',
      totalWins: 99
    });

    // Validations:
    // 1. MUST NOT receive game_started
    const gameStartedEvent = emitted.find(e => e.target === 'socket-usopp-sniper-77' && e.event === 'game_started');
    expect(gameStartedEvent).toBeUndefined();

    // 2. MUST receive return_to_lobby
    const returnToLobbyEvent = emitted.find(e => e.target === 'socket-usopp-sniper-77' && e.event === 'return_to_lobby');
    expect(returnToLobbyEvent).toBeDefined();

    // 3. MUST receive game_in_progress with gameType and playersCount
    const gameInProgressEvent = emitted.find(e => e.target === 'socket-usopp-sniper-77' && e.event === 'game_in_progress');
    expect(gameInProgressEvent).toBeDefined();
    expect(gameInProgressEvent?.data).toEqual({
      gameType: 'stop',
      playersCount: 2
    });
  });

  it('c) La sala recibe el evento player_waiting_in_lobby con los datos del nuevo jugador y mensaje de aviso', () => {
    const roomId = manager.createRoom('host-nami');
    const room = manager.getRoom(roomId)!;

    const mockGameEngine: any = {
      players: [
        { userId: 'host-nami', name: 'Nami' }
      ],
      broadcastMessage: mock((msg: string) => {}),
      broadcastState: mock(() => {})
    };

    room.gameType = 'parchis';
    room.gameEngine = mockGameEngine;

    const newPlayerSocket: any = {
      id: 'socket-brook-44',
      join: mock((r: string) => {}),
      data: {}
    };

    handler.handleJoin(newPlayerSocket, {
      roomId,
      userId: 'new-user-brook',
      nickname: 'Brook',
      avatarId: 4,
      color: '#a855f7',
      totalWins: 12
    });

    // Validations:
    // 1. Room receives player_waiting_in_lobby with player data
    const waitingEvent = emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby');
    expect(waitingEvent).toBeDefined();
    expect(waitingEvent?.data).toEqual({
      userId: 'new-user-brook',
      nickname: 'Brook',
      avatarId: 4,
      color: '#a855f7'
    });

    // 2. Engine broadcastMessage notifies active players that Brook is waiting in lobby
    expect(mockGameEngine.broadcastMessage).toHaveBeenCalledWith(
      '👋 Brook ha llegado y está esperando en el Lobby.'
    );

    // 3. New player was registered into room.users
    const user = room.users.find(u => u.userId === 'new-user-brook');
    expect(user).toBeDefined();
    expect(user?.nickname).toBe('Brook');
    expect(user?.socketId).toBe('socket-brook-44');
  });

  it('d) Edge Case: Si el juego NO está activo, jugador nuevo recibe return_to_lobby y NO game_in_progress ni player_waiting_in_lobby', () => {
    const roomId = manager.createRoom('host-robin');
    const room = manager.getRoom(roomId)!;
    room.gameEngine = undefined;
    room.gameType = undefined;

    const normalSocket: any = {
      id: 'socket-normal-10',
      join: mock((r: string) => {}),
      data: {}
    };

    handler.handleJoin(normalSocket, {
      roomId,
      userId: 'normal-user-frankie',
      nickname: 'Franky',
      avatarId: 5,
      color: '#06b6d4',
      totalWins: 42
    });

    // Should only receive return_to_lobby
    const returnToLobbyEvent = emitted.find(e => e.target === 'socket-normal-10' && e.event === 'return_to_lobby');
    expect(returnToLobbyEvent).toBeDefined();

    const gameStartedEvent = emitted.find(e => e.target === 'socket-normal-10' && e.event === 'game_started');
    expect(gameStartedEvent).toBeUndefined();

    const gameInProgressEvent = emitted.find(e => e.target === 'socket-normal-10' && e.event === 'game_in_progress');
    expect(gameInProgressEvent).toBeUndefined();

    const waitingEvent = emitted.find(e => e.event === 'player_waiting_in_lobby');
    expect(waitingEvent).toBeUndefined();
  });
});

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { RoomJoinHandler } from './RoomJoinHandler.js';
import { RoomManager } from './RoomManager.js';
import { registerAllGameRoutes } from './GameDispatcher.js';

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

  // =========================================================================
  // PRUEBAS EXPLÍCITAS PARA LOS 6 JUEGOS (Reconexión + Nuevo Jugador en Espera)
  // =========================================================================

  it('1. uno: Reconexión en partida activa y nuevo jugador esperando en lobby', () => {
    const roomId = manager.createRoom('uno-host');
    const room = manager.getRoom(roomId)!;

    const mockUnoEngine: any = {
      players: [
        { userId: 'uno-host', nickname: 'HostUno', isOffline: false },
        { userId: 'uno-active-player', nickname: 'ActiveUno', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      sendFullStateToPlayer: mock((socketId: string, userId: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'uno';
    room.gameEngine = mockUnoEngine;
    room.users.push({
      socketId: 'sock-old-uno',
      userId: 'uno-active-player',
      originalNickname: 'ActiveUno',
      nickname: 'ActiveUno',
      avatarId: 1,
      color: '#ef4444',
      totalWins: 3,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión de jugador activo
    const reconnectSocket: any = {
      id: 'sock-recon-uno',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconnectSocket, {
      roomId,
      userId: 'uno-active-player',
      nickname: 'ActiveUno',
      avatarId: 1,
      color: '#ef4444',
      totalWins: 3
    });

    expect(emitted.find(e => e.target === 'sock-recon-uno' && e.event === 'game_started')?.data).toEqual({ gameType: 'uno' });
    expect(emitted.find(e => e.target === 'sock-recon-uno' && e.event === 'game_in_progress')).toBeUndefined();
    expect(mockUnoEngine.setPlayerOffline).toHaveBeenCalledWith('uno-active-player', false);
    expect(mockUnoEngine.sendFullStateToPlayer).toHaveBeenCalledWith('sock-recon-uno', 'uno-active-player');
    expect(mockUnoEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador en espera
    const newSocket: any = {
      id: 'sock-new-uno',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'uno-new-player',
      nickname: 'NewUno',
      avatarId: 2,
      color: '#3b82f6',
      totalWins: 0
    });

    expect(emitted.find(e => e.target === 'sock-new-uno' && e.event === 'game_started')).toBeUndefined();
    expect(emitted.find(e => e.target === 'sock-new-uno' && e.event === 'return_to_lobby')).toBeDefined();
    expect(emitted.find(e => e.target === 'sock-new-uno' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'uno',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')?.data).toEqual({
      userId: 'uno-new-player',
      nickname: 'NewUno',
      avatarId: 2,
      color: '#3b82f6'
    });
    expect(mockUnoEngine.broadcastMessage).toHaveBeenCalledWith('👋 NewUno ha llegado y está esperando en el Lobby.');
  });

  it('2. parchis: Reconexión en partida activa y nuevo jugador esperando en lobby', () => {
    const roomId = manager.createRoom('parchis-host');
    const room = manager.getRoom(roomId)!;

    const mockParchisEngine: any = {
      players: [
        { userId: 'parchis-host', nickname: 'HostParchis', isOffline: false },
        { userId: 'parchis-active-player', nickname: 'ActiveParchis', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'parchis';
    room.gameEngine = mockParchisEngine;
    room.users.push({
      socketId: 'sock-old-parchis',
      userId: 'parchis-active-player',
      originalNickname: 'ActiveParchis',
      nickname: 'ActiveParchis',
      avatarId: 2,
      color: '#eab308',
      totalWins: 7,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión
    const reconSocket: any = {
      id: 'sock-recon-parchis',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconSocket, {
      roomId,
      userId: 'parchis-active-player',
      nickname: 'ActiveParchis',
      avatarId: 2,
      color: '#eab308',
      totalWins: 7
    });

    expect(emitted.find(e => e.target === 'sock-recon-parchis' && e.event === 'game_started')?.data).toEqual({ gameType: 'parchis' });
    expect(emitted.find(e => e.target === 'sock-recon-parchis' && e.event === 'game_in_progress')).toBeUndefined();
    expect(mockParchisEngine.setPlayerOffline).toHaveBeenCalledWith('parchis-active-player', false);
    expect(mockParchisEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador
    const newSocket: any = {
      id: 'sock-new-parchis',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'parchis-new-player',
      nickname: 'NewParchis',
      avatarId: 3,
      color: '#10b981',
      totalWins: 2
    });

    expect(emitted.find(e => e.target === 'sock-new-parchis' && e.event === 'return_to_lobby')).toBeDefined();
    expect(emitted.find(e => e.target === 'sock-new-parchis' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'parchis',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')).toBeDefined();
    expect(mockParchisEngine.broadcastMessage).toHaveBeenCalledWith('👋 NewParchis ha llegado y está esperando en el Lobby.');
  });

  it('3. stop: Reconexión en partida activa y nuevo jugador esperando en lobby', () => {
    const roomId = manager.createRoom('stop-host');
    const room = manager.getRoom(roomId)!;

    const mockStopEngine: any = {
      players: [
        { userId: 'stop-host', nickname: 'HostStop', isOffline: false },
        { userId: 'stop-active-player', nickname: 'ActiveStop', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'stop';
    room.gameEngine = mockStopEngine;
    room.users.push({
      socketId: 'sock-old-stop',
      userId: 'stop-active-player',
      originalNickname: 'ActiveStop',
      nickname: 'ActiveStop',
      avatarId: 4,
      color: '#8b5cf6',
      totalWins: 1,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión
    const reconSocket: any = {
      id: 'sock-recon-stop',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconSocket, {
      roomId,
      userId: 'stop-active-player',
      nickname: 'ActiveStop',
      avatarId: 4,
      color: '#8b5cf6',
      totalWins: 1
    });

    expect(emitted.find(e => e.target === 'sock-recon-stop' && e.event === 'game_started')?.data).toEqual({ gameType: 'stop' });
    expect(mockStopEngine.setPlayerOffline).toHaveBeenCalledWith('stop-active-player', false);
    expect(mockStopEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador
    const newSocket: any = {
      id: 'sock-new-stop',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'stop-new-player',
      nickname: 'NewStop',
      avatarId: 5,
      color: '#ec4899',
      totalWins: 0
    });

    expect(emitted.find(e => e.target === 'sock-new-stop' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'stop',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')).toBeDefined();
    expect(mockStopEngine.broadcastMessage).toHaveBeenCalledWith('👋 NewStop ha llegado y está esperando en el Lobby.');
  });

  it('4. liars: Reconexión en partida activa y nuevo jugador esperando en lobby', () => {
    const roomId = manager.createRoom('liars-host');
    const room = manager.getRoom(roomId)!;

    const mockLiarsEngine: any = {
      players: [
        { userId: 'liars-host', nickname: 'HostLiars', isOffline: false },
        { userId: 'liars-active-player', nickname: 'ActiveLiars', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'liars';
    room.gameEngine = mockLiarsEngine;
    room.users.push({
      socketId: 'sock-old-liars',
      userId: 'liars-active-player',
      originalNickname: 'ActiveLiars',
      nickname: 'ActiveLiars',
      avatarId: 6,
      color: '#f97316',
      totalWins: 8,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión
    const reconSocket: any = {
      id: 'sock-recon-liars',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconSocket, {
      roomId,
      userId: 'liars-active-player',
      nickname: 'ActiveLiars',
      avatarId: 6,
      color: '#f97316',
      totalWins: 8
    });

    expect(emitted.find(e => e.target === 'sock-recon-liars' && e.event === 'game_started')?.data).toEqual({ gameType: 'liars' });
    expect(mockLiarsEngine.setPlayerOffline).toHaveBeenCalledWith('liars-active-player', false);
    expect(mockLiarsEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador
    const newSocket: any = {
      id: 'sock-new-liars',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'liars-new-player',
      nickname: 'NewLiars',
      avatarId: 1,
      color: '#14b8a6',
      totalWins: 4
    });

    expect(emitted.find(e => e.target === 'sock-new-liars' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'liars',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')).toBeDefined();
    expect(mockLiarsEngine.broadcastMessage).toHaveBeenCalledWith('👋 NewLiars ha llegado y está esperando en el Lobby.');
  });

  it('5. pinturillo: Reconexión en partida activa + nuevo jugador en espera + notificación de chat', () => {
    const roomId = manager.createRoom('pinturillo-host');
    const room = manager.getRoom(roomId)!;

    // Pinturillo engine sin broadcastMessage en el objeto para verificar fallback a chat_message (isSystem: true)
    const mockPinturilloEngine: any = {
      players: [
        { userId: 'pinturillo-host', nickname: 'HostPintu', isOffline: false },
        { userId: 'pinturillo-active-player', nickname: 'ActivePintu', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      sendFullStateToPlayer: mock((socketId: string, userId: string) => {}),
      broadcastState: mock(() => {})
      // NOTA: No tiene broadcastMessage para activar la notificación vía chat_message
    };

    room.gameType = 'pinturillo';
    room.gameEngine = mockPinturilloEngine;
    room.users.push({
      socketId: 'sock-old-pintu',
      userId: 'pinturillo-active-player',
      originalNickname: 'ActivePintu',
      nickname: 'ActivePintu',
      avatarId: 2,
      color: '#06b6d4',
      totalWins: 5,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión
    const reconSocket: any = {
      id: 'sock-recon-pintu',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconSocket, {
      roomId,
      userId: 'pinturillo-active-player',
      nickname: 'ActivePintu',
      avatarId: 2,
      color: '#06b6d4',
      totalWins: 5
    });

    expect(emitted.find(e => e.target === 'sock-recon-pintu' && e.event === 'game_started')?.data).toEqual({ gameType: 'pinturillo' });
    expect(mockPinturilloEngine.setPlayerOffline).toHaveBeenCalledWith('pinturillo-active-player', false);
    expect(mockPinturilloEngine.sendFullStateToPlayer).toHaveBeenCalledWith('sock-recon-pintu', 'pinturillo-active-player');
    expect(mockPinturilloEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador en espera con notificación de chat_message
    const newSocket: any = {
      id: 'sock-new-pintu',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'pinturillo-new-player',
      nickname: 'Picasso',
      avatarId: 3,
      color: '#e11d48',
      totalWins: 15
    });

    expect(emitted.find(e => e.target === 'sock-new-pintu' && e.event === 'return_to_lobby')).toBeDefined();
    expect(emitted.find(e => e.target === 'sock-new-pintu' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'pinturillo',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')).toBeDefined();

    // Verificación CRÍTICA: al no tener broadcastMessage, emite chat_message (isSystem: true)
    const chatMsgEvent = emitted.find(e => e.target === roomId && e.event === 'chat_message');
    expect(chatMsgEvent).toBeDefined();
    expect(chatMsgEvent?.data).toEqual({
      isSystem: true,
      text: '👋 Picasso ha llegado y está esperando en el Lobby.'
    });
  });

  it('6. impostor: Reconexión en partida activa y nuevo jugador esperando en lobby', () => {
    const roomId = manager.createRoom('impostor-host');
    const room = manager.getRoom(roomId)!;

    const mockImpostorEngine: any = {
      players: [
        { userId: 'impostor-host', nickname: 'HostImpostor', isOffline: false },
        { userId: 'impostor-active-player', nickname: 'ActiveImpostor', isOffline: true }
      ],
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      addPlayer: mock((userId: string, socketId: string, nickname: string, avatarId: number, color: string) => {}),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'impostor';
    room.gameEngine = mockImpostorEngine;
    room.users.push({
      socketId: 'sock-old-imp',
      userId: 'impostor-active-player',
      originalNickname: 'ActiveImpostor',
      nickname: 'ActiveImpostor',
      avatarId: 4,
      color: '#64748b',
      totalWins: 11,
      seatIndex: 1,
      isOffline: true
    });

    // 1. Reconexión
    const reconSocket: any = {
      id: 'sock-recon-imp',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(reconSocket, {
      roomId,
      userId: 'impostor-active-player',
      nickname: 'ActiveImpostor',
      avatarId: 4,
      color: '#64748b',
      totalWins: 11
    });

    expect(emitted.find(e => e.target === 'sock-recon-imp' && e.event === 'game_started')?.data).toEqual({ gameType: 'impostor' });
    expect(mockImpostorEngine.setPlayerOffline).toHaveBeenCalledWith('impostor-active-player', false);
    expect(mockImpostorEngine.broadcastState).toHaveBeenCalled();

    // 2. Nuevo jugador
    const newSocket: any = {
      id: 'sock-new-imp',
      join: mock(() => {}),
      data: {}
    };

    handler.handleJoin(newSocket, {
      roomId,
      userId: 'impostor-new-player',
      nickname: 'NewImpostor',
      avatarId: 5,
      color: '#84cc16',
      totalWins: 2
    });

    expect(emitted.find(e => e.target === 'sock-new-imp' && e.event === 'game_in_progress')?.data).toEqual({
      gameType: 'impostor',
      playersCount: 2
    });
    expect(emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby')).toBeDefined();
    expect(mockImpostorEngine.broadcastMessage).toHaveBeenCalledWith('👋 NewImpostor ha llegado y está esperando en el Lobby.');
  });

  // =========================================================================
  // ESCENARIO CRÍTICO DE 5 MINUTOS (Desconexión > 30s + Reingreso Seguro)
  // =========================================================================

  it('7. Escenario de 5 Minutos: Jugador A se desconecta >30s, es purgado del motor y de room.users, y al volver regresa como espectador/lobby sin romper la partida', () => {
    const roomId = manager.createRoom('host-user');
    const room = manager.getRoom(roomId)!;

    const mockGameEngine: any = {
      players: [
        { userId: 'host-user', nickname: 'Host', isOffline: false },
        { userId: 'player-a', nickname: 'PlayerA', isOffline: false },
        { userId: 'player-b', nickname: 'PlayerB', isOffline: false }
      ],
      removePlayer: mock((userId: string) => {
        mockGameEngine.players = mockGameEngine.players.filter((p: any) => p.userId !== userId);
      }),
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {
        const p = mockGameEngine.players.find((pl: any) => pl.userId === userId);
        if (p) p.isOffline = isOffline;
      }),
      broadcastState: mock(() => {}),
      broadcastMessage: mock((msg: string) => {})
    };

    room.gameType = 'uno';
    room.gameEngine = mockGameEngine;

    room.users = [
      { socketId: 'sock-host', userId: 'host-user', nickname: 'Host', originalNickname: 'Host', avatarId: 1, color: '#ff0000', totalWins: 5, seatIndex: 0, isOffline: false },
      { socketId: 'sock-a', userId: 'player-a', nickname: 'PlayerA', originalNickname: 'PlayerA', avatarId: 2, color: '#00ff00', totalWins: 3, seatIndex: 1, isOffline: false },
      { socketId: 'sock-b', userId: 'player-b', nickname: 'PlayerB', originalNickname: 'PlayerB', avatarId: 3, color: '#0000ff', totalWins: 2, seatIndex: 2, isOffline: false }
    ];

    const socketA: any = {
      id: 'sock-a',
      data: { roomId, userId: 'player-a' }
    };

    // Interceptar el callback de 30 segundos de setTimeout
    let disconnectTimerCb: (() => void) | null = null;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, ms: number) => {
      if (ms === 30000) {
        disconnectTimerCb = cb;
        return originalSetTimeout(() => {}, 9999999);
      }
      return originalSetTimeout(cb, ms);
    }) as any;

    try {
      // 1. Jugador A se desconecta
      handler.handleDisconnect(socketA);

      // Verificación inmediata: Jugador A pasa a offline pero aún existe en room.users y en engine
      expect(room.users.find(u => u.userId === 'player-a')?.isOffline).toBe(true);
      expect(mockGameEngine.setPlayerOffline).toHaveBeenCalledWith('player-a', true);
      expect(room.users.some(u => u.userId === 'player-a')).toBe(true);
      expect(mockGameEngine.players.some((p: any) => p.userId === 'player-a')).toBe(true);

      // 2. Simular que pasan los 30 segundos (tolerancia expirada)
      expect(disconnectTimerCb).not.toBeNull();
      disconnectTimerCb!();

      // Verificación de purga: Jugador A fue eliminado de room.users y de gameEngine
      expect(room.users.find(u => u.userId === 'player-a')).toBeUndefined();
      expect(mockGameEngine.removePlayer).toHaveBeenCalledWith('player-a');
      expect(mockGameEngine.players.find((p: any) => p.userId === 'player-a')).toBeUndefined();
      expect(mockGameEngine.players.length).toBe(2); // Quedan Host y PlayerB

      // 3. Pasan 5 minutos y Jugador A regresa con su mismo userId
      emitted.length = 0; // Limpiar eventos previos

      const socketA5Min: any = {
        id: 'sock-a-5min-later',
        join: mock(() => {}),
        data: {}
      };

      handler.handleJoin(socketA5Min, {
        roomId,
        userId: 'player-a',
        nickname: 'PlayerA',
        avatarId: 2,
        color: '#00ff00',
        totalWins: 3
      });

      // 4. Verificaciones de protección ante re-ingreso:
      // a) NO entra roto a la partida activa (NO recibe game_started)
      const gameStartedEvent = emitted.find(e => e.target === 'sock-a-5min-later' && e.event === 'game_started');
      expect(gameStartedEvent).toBeUndefined();

      // b) Recibe return_to_lobby y game_in_progress
      const returnLobbyEvent = emitted.find(e => e.target === 'sock-a-5min-later' && e.event === 'return_to_lobby');
      expect(returnLobbyEvent).toBeDefined();

      const gameProgressEvent = emitted.find(e => e.target === 'sock-a-5min-later' && e.event === 'game_in_progress');
      expect(gameProgressEvent).toBeDefined();
      expect(gameProgressEvent?.data).toEqual({
        gameType: 'uno',
        playersCount: 2
      });

      // c) La sala recibe player_waiting_in_lobby
      const waitingEvent = emitted.find(e => e.target === roomId && e.event === 'player_waiting_in_lobby');
      expect(waitingEvent).toBeDefined();
      expect(waitingEvent?.data.userId).toBe('player-a');

      // d) La partida sigue viva para los demás sin bloquearse
      expect(mockGameEngine.players.length).toBe(2);
      expect(mockGameEngine.players.map((p: any) => p.userId)).toEqual(['host-user', 'player-b']);
      expect(room.users.some(u => u.userId === 'player-a')).toBe(true); // Está en la sala (lobby), no en el motor
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  // =========================================================================
  // MIGRACIÓN DE HOST (>30s Y CONTROL DE ACCESO)
  // =========================================================================

  it('8. Migración de Host: Host ausente >30s pierde rol, nuevo host asume, viejo host regresa y NO puede forzar return_to_lobby', () => {
    const roomId = manager.createRoom('old-host-user');
    const room = manager.getRoom(roomId)!;

    const mockGameEngine: any = {
      state: 'PLAYING',
      players: [
        { userId: 'old-host-user', nickname: 'OldHost', isOffline: false },
        { userId: 'new-host-user', nickname: 'NewHost', isOffline: false }
      ],
      removePlayer: mock((userId: string) => {
        mockGameEngine.players = mockGameEngine.players.filter((p: any) => p.userId !== userId);
      }),
      setPlayerOffline: mock((userId: string, isOffline: boolean) => {}),
      destroy: mock(() => {}),
      broadcastState: mock(() => {})
    };

    room.gameType = 'uno';
    room.gameEngine = mockGameEngine;
    room.hostUserId = 'old-host-user';

    room.users = [
      { socketId: 'sock-old-host', userId: 'old-host-user', nickname: 'OldHost', originalNickname: 'OldHost', avatarId: 1, color: '#ff0000', totalWins: 10, seatIndex: 0, isOffline: false },
      { socketId: 'sock-new-host', userId: 'new-host-user', nickname: 'NewHost', originalNickname: 'NewHost', avatarId: 2, color: '#0000ff', totalWins: 8, seatIndex: 1, isOffline: false },
      { socketId: 'bot-socket', userId: 'bot-1', nickname: 'BotUno', originalNickname: 'BotUno', avatarId: 3, color: '#00ff00', totalWins: 0, seatIndex: 2, isOffline: false, isBot: true }
    ];

    const hostSocket: any = {
      id: 'sock-old-host',
      data: { roomId, userId: 'old-host-user' }
    };

    let disconnectTimerCb: (() => void) | null = null;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: any, ms: number) => {
      if (ms === 30000) {
        disconnectTimerCb = cb;
        return originalSetTimeout(() => {}, 9999999);
      }
      return originalSetTimeout(cb, ms);
    }) as any;

    try {
      // 1. Host original se desconecta
      handler.handleDisconnect(hostSocket);

      // 2. Transcurren los 30 segundos
      expect(disconnectTimerCb).not.toBeNull();
      disconnectTimerCb!();

      // 3. Verificación de Migración de Host:
      // old-host-user fue removido, y el rol pasó al primer jugador real (new-host-user, no el bot)
      expect(room.users.some(u => u.userId === 'old-host-user')).toBe(false);
      expect(room.hostUserId).toBe('new-host-user');
      expect(mockGameEngine.removePlayer).toHaveBeenCalledWith('old-host-user');

      // 4. Pasan 5 minutos y el viejo host regresa
      const returningHostSocket: any = {
        id: 'sock-old-host-returns',
        join: mock(() => {}),
        data: {}
      };

      handler.handleJoin(returningHostSocket, {
        roomId,
        userId: 'old-host-user',
        nickname: 'OldHost',
        avatarId: 1,
        color: '#ff0000',
        totalWins: 10
      });

      // Verificación: El hostUserId se MANTIENE en new-host-user (el viejo host NO recupera el mando)
      expect(room.hostUserId).toBe('new-host-user');

      // 5. El viejo host intenta forzar return_to_lobby a través de las rutas de juego
      const oldHostListeners = new Map<string, Function>();
      const oldHostRouteSocket: any = {
        id: 'sock-old-host-returns',
        data: { roomId, userId: 'old-host-user' },
        on: (evt: string, fn: Function) => oldHostListeners.set(evt, fn),
        join: mock(() => {}),
        leave: mock(() => {})
      };

      registerAllGameRoutes(oldHostRouteSocket, manager);

      const returnToLobbyHandler = oldHostListeners.get('return_to_lobby');
      expect(returnToLobbyHandler).toBeDefined();

      emitted.length = 0;
      returnToLobbyHandler!();

      // Verificación de seguridad: El juego NO fue destruido, sigue activo, y la sala no volvió al lobby
      expect(room.gameEngine).toBeDefined();
      expect(room.gameType).toBe('uno');
      expect(emitted.find(e => e.target === roomId && e.event === 'return_to_lobby')).toBeUndefined();

      // 6. En cambio, cuando el NUEVO host emite return_to_lobby, sí se destruye y vuelve al lobby
      const newHostListeners = new Map<string, Function>();
      const newHostRouteSocket: any = {
        id: 'sock-new-host',
        data: { roomId, userId: 'new-host-user' },
        on: (evt: string, fn: Function) => newHostListeners.set(evt, fn),
        join: mock(() => {}),
        leave: mock(() => {})
      };

      registerAllGameRoutes(newHostRouteSocket, manager);

      const newHostReturnHandler = newHostListeners.get('return_to_lobby');
      expect(newHostReturnHandler).toBeDefined();

      newHostReturnHandler!();

      expect(mockGameEngine.destroy).toHaveBeenCalled();
      expect(room.gameEngine).toBeUndefined();
      expect(room.gameType).toBeUndefined();
      expect(emitted.find(e => e.target === roomId && e.event === 'return_to_lobby')).toBeDefined();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

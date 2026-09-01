import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { StopEngine } from './StopEngine.js';
import { StopValidationLogic } from './StopValidationLogic.js';
import { setupStopGame } from './StopSetup.js';

describe('StopEngine', () => {
  let engine: StopEngine;

  beforeEach(() => {
    engine = new StopEngine('room1', {} as any);
  });

  it('should instantiate correctly', () => {
    expect(engine.roomId).toBe('room1');
    expect(engine.state).toBe('LOBBY');
    expect(engine.players.length).toBe(0);
  });

  it('should add players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    expect(engine.players.length).toBe(1);
    expect(engine.players[0].userId).toBe('user1');
  });

  it('should transition to PLAYING and assign a letter when starting game', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    
    const emitSpy = mock(() => true);
    engine.emit = emitSpy;

    engine.startGame({ categories: ['Nombre'], rounds: 3 });

    expect(engine.state).toBe('PLAYING');
    expect(engine.currentLetter).not.toBeNull();
    expect(engine.currentRound).toBe(1);
    
    // Check events
    const emitCalls = emitSpy.mock.calls;
    const hasGameStateUpdate = emitCalls.some(call => (call as any)[0] === 'game_state_update');
    expect(hasGameStateUpdate).toBe(true);
  });

  it('should verify and handle vetos properly', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    engine.rules = { categories: ['Nombre', 'Cosa'], rounds: 3, timeLimit: 60, verificationTime: 30 };
    engine.emit = mock(() => true);

    engine.players[0].currentAnswers = { Nombre: 'Ana', Cosa: 'Auto' };
    engine.players[1].currentAnswers = { Nombre: 'Andres', Cosa: '' };

    StopValidationLogic.startVerifying(engine);

    expect(engine.state).toBe('VERIFYING');
    expect(engine.verifyingData.length).toBe(2);

    const nombreCat = engine.verifyingData.find(c => c.category === 'Nombre');
    expect(nombreCat?.answers.length).toBe(2);

    // user2 vetos user1's 'Nombre'
    StopValidationLogic.voteVeto(engine, 'user2', 'Nombre', 'user1');
    const user1Answer = nombreCat?.answers.find(a => a.userId === 'user1');
    expect(user1Answer?.vetos).toContain('user2');

    // Unregistered attacker cannot vote veto
    StopValidationLogic.voteVeto(engine, 'attacker_user', 'Nombre', 'user1');
    expect(user1Answer?.vetos).not.toContain('attacker_user');

    // Offline player cannot vote veto
    engine.players[1].isOffline = true;
    StopValidationLogic.voteVeto(engine, 'user2', 'Nombre', 'user1'); // should not be able to toggle/veto while offline
    expect(user1Answer?.vetos).toContain('user2'); // still present because offline attempt was ignored
    engine.players[1].isOffline = false;

    // toggle veto (user2 un-vetos)
    StopValidationLogic.voteVeto(engine, 'user2', 'Nombre', 'user1');
    expect(user1Answer?.vetos).not.toContain('user2');

    if (engine.verifyingTimeout) {
      clearTimeout(engine.verifyingTimeout);
      engine.verifyingTimeout = null;
    }
  });

  describe('setupStopGame rules mapping', () => {
    it('should correctly map frontendRules with stopCategories and stopRounds fallback', () => {
      const mockRoom: any = {
        users: [{ userId: 'u1', socketId: 's1', nickname: 'Alice', avatarId: 1, color: '#f00' }],
      };
      const mockIo: any = {
        to: () => ({ emit: () => {} }),
      };
      const frontendRules = {
        stopCategories: ['FRUTA', 'PAIS'],
        stopRounds: 3,
        verificationTime: 25,
        timeLimit: 45,
        bannedLetters: ['W', 'X']
      };

      setupStopGame('test-room-1', mockRoom, mockIo, frontendRules, {} as any);

      const createdEngine = mockRoom.gameEngine as StopEngine;
      expect(createdEngine).toBeDefined();
      expect(createdEngine.rules.categories).toEqual(['FRUTA', 'PAIS']);
      expect(createdEngine.rules.rounds).toBe(3);
      expect(createdEngine.rules.verificationTime).toBe(25);
      expect(createdEngine.rules.timeLimit).toBe(45);
      expect(createdEngine.rules.bannedLetters).toEqual(['W', 'X']);
      createdEngine.destroy();
    });

    it('should correctly map frontendRules with standard categories and rounds properties', () => {
      const mockRoom: any = {
        users: [{ userId: 'u1', socketId: 's1', nickname: 'Alice', avatarId: 1, color: '#f00' }],
      };
      const mockIo: any = {
        to: () => ({ emit: () => {} }),
      };
      const frontendRules = {
        categories: ['CIUDAD', 'MARCA'],
        rounds: 4,
        verificationTime: 20,
        timeLimit: 50,
        bannedLetters: ['K']
      };

      setupStopGame('test-room-2', mockRoom, mockIo, frontendRules, {} as any);

      const createdEngine = mockRoom.gameEngine as StopEngine;
      expect(createdEngine).toBeDefined();
      expect(createdEngine.rules.categories).toEqual(['CIUDAD', 'MARCA']);
      expect(createdEngine.rules.rounds).toBe(4);
      expect(createdEngine.rules.verificationTime).toBe(20);
      expect(createdEngine.rules.timeLimit).toBe(50);
      expect(createdEngine.rules.bannedLetters).toEqual(['K']);
      createdEngine.destroy();
    });

    it('should fallback to defaults when rules are empty or undefined', () => {
      const mockRoom: any = {
        users: [{ userId: 'u1', socketId: 's1', nickname: 'Alice', avatarId: 1, color: '#f00' }],
      };
      const mockIo: any = {
        to: () => ({ emit: () => {} }),
      };

      setupStopGame('test-room-3', mockRoom, mockIo, {}, {} as any);

      const createdEngine = mockRoom.gameEngine as StopEngine;
      expect(createdEngine).toBeDefined();
      expect(createdEngine.rules.categories).toEqual(["NOMBRE", "ANIMAL", "COLOR", "COSA", "FRUTA"]);
      expect(createdEngine.rules.rounds).toBe(5);
      expect(createdEngine.rules.verificationTime).toBe(30);
      expect(createdEngine.rules.timeLimit).toBe(60);
      expect(createdEngine.rules.bannedLetters).toEqual([]);
      createdEngine.destroy();
    });
  });
});

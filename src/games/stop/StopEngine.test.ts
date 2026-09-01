import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { StopEngine } from './StopEngine.js';
import { StopValidationLogic } from './StopValidationLogic.js';

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

    // toggle veto (user2 un-vetos)
    StopValidationLogic.voteVeto(engine, 'user2', 'Nombre', 'user1');
    expect(user1Answer?.vetos).not.toContain('user2');

    if (engine.verifyingTimeout) {
      clearTimeout(engine.verifyingTimeout);
      engine.verifyingTimeout = null;
    }
  });
});

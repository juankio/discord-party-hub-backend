import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ImpostorEngine } from './ImpostorEngine.js';

describe('ImpostorEngine', () => {
  let engine: ImpostorEngine;

  beforeEach(() => {
    engine = new ImpostorEngine('room1');
  });

  it('should instantiate correctly', () => {
    expect(engine.roomId).toBe('room1');
    expect(engine.state).toBe('WAITING');
    expect(engine.players.length).toBe(0);
  });

  it('should add players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    expect(engine.players.length).toBe(1);
    expect(engine.players[0].userId).toBe('user1');
  });

  it('should transition to WORDS_REVEALED when starting game with enough players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    engine.addPlayer('user3', 'socket3', 'Charlie', 3, '#0000ff');
    
    const emitSpy = mock(() => true);
    engine.emit = emitSpy;

    engine.startGame();

    expect(engine.state).toBe('WORDS_REVEALED');
    expect(engine.impostorUserId).not.toBeNull();
    
    // Test that word was assigned
    engine.players.forEach(p => {
      expect(p.assignedWord).toBeDefined();
    });

    // Check events
    const emitCalls = emitSpy.mock.calls;
    const hasGameStateUpdate = emitCalls.some(call => call[0] === 'game_state_update');
    expect(hasGameStateUpdate).toBe(true);
  });

  it('should not start with less than 3 players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    
    engine.startGame();
    expect(engine.state).toBe('WAITING');
  });
});

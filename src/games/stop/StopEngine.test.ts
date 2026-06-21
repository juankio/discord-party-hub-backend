import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { StopEngine } from './StopEngine.js';

describe('StopEngine', () => {
  let engine: StopEngine;

  beforeEach(() => {
    engine = new StopEngine('room1');
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
});

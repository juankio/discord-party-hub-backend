import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ParchisEngine } from './ParchisEngine.js';

describe('ParchisEngine', () => {
  let engine: ParchisEngine;

  beforeEach(() => {
    engine = new ParchisEngine('room1', {} as any);
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

  it('should transition to CHOOSING_TOKENS when starting game', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    
    const emitSpy = mock(() => true);
    engine.emit = emitSpy;

    engine.startGame({ parchisBoardSize: 4 });

    expect(engine.state).toBe('CHOOSING_TOKENS');
    
    // Check events
    const emitCalls = emitSpy.mock.calls;
    const hasGameStateUpdate = emitCalls.some(call => (call as any)[0] === 'game_state_update');
    expect(hasGameStateUpdate).toBe(true);
  });
});

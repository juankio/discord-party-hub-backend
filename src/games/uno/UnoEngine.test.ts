import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { UnoEngine } from './UnoEngine.js';

describe('UnoEngine', () => {
  let engine: UnoEngine;

  beforeEach(() => {
    engine = new UnoEngine('room1', {} as any);
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
    expect(engine.players[0].nickname).toBe('Alice');
  });

  it('should transition to PLAYING and deal 7 cards when starting game', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    
    // We mock emit to verify it emits game_state_update
    const emitSpy = mock(() => true);
    engine.emit = emitSpy;

    engine.startGame({ stackDrawCards: false, drawUntilPlayable: false, playMultipleSame: false, interceptExact: false, zeroAndSevenRules: false });

    expect(engine.state).toBe('PLAYING');
    expect(engine.players[0].hand.length).toBe(7);
    expect(engine.players[1].hand.length).toBe(7);
    
    // Verify it emits
    expect(emitSpy).toHaveBeenCalled();
    const emitCalls = emitSpy.mock.calls;
    const hasGameStateUpdate = emitCalls.some(call => (call as any)[0] === 'game_state_update');
    expect(hasGameStateUpdate).toBe(true);
  });

  it('should not start game if less than 2 players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.startGame({ stackDrawCards: false, drawUntilPlayable: false, playMultipleSame: false, interceptExact: false, zeroAndSevenRules: false });
    expect(engine.state).toBe('WAITING');
  });
});

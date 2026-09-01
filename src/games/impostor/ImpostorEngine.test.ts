import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';
import { ImpostorEngine } from './ImpostorEngine.js';
import { ImpostorRolesLogic } from './ImpostorRolesLogic.js';
import { ImpostorVotingLogic } from './ImpostorVotingLogic.js';

describe('ImpostorEngine', () => {
  let engine: ImpostorEngine;

  beforeEach(() => {
    engine = new ImpostorEngine('room1', {} as any);
  });

  afterEach(() => {
    engine.destroy();
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
    const hasGameStateUpdate = emitCalls.some(call => (call as any)[0] === 'game_state_update');
    expect(hasGameStateUpdate).toBe(true);
  });

  it('should not start with less than 2 players', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');

    engine.startGame();
    expect(engine.state).toBe('WAITING');
  });

  it('should preserve the same impostor in round 2 and 3 if impostor is still alive', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    engine.addPlayer('user3', 'socket3', 'Charlie', 3, '#0000ff');
    engine.emit = mock(() => true);

    engine.startGame();
    const round1ImpostorId = engine.impostorUserId;
    expect(round1ImpostorId).not.toBeNull();

    const impostorInRound1 = engine.players.find(p => p.userId === round1ImpostorId);
    expect(impostorInRound1?.isImpostor).toBe(true);

    // Start Round 2 without killing the impostor
    ImpostorRolesLogic.startNewRound(engine);

    expect(engine.currentRound).toBe(2);
    expect(engine.impostorUserId).toBe(round1ImpostorId);
    
    const impostorInRound2 = engine.players.find(p => p.userId === round1ImpostorId);
    expect(impostorInRound2?.isImpostor).toBe(true);

    // Start Round 3 without killing the impostor
    ImpostorRolesLogic.startNewRound(engine);

    expect(engine.currentRound).toBe(3);
    expect(engine.impostorUserId).toBe(round1ImpostorId);

    const impostorInRound3 = engine.players.find(p => p.userId === round1ImpostorId);
    expect(impostorInRound3?.isImpostor).toBe(true);
  });

  it('should start RESULTS timer and countdown timeRemaining on processVotes', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    engine.addPlayer('user3', 'socket3', 'Charlie', 3, '#0000ff');
    engine.emit = mock(() => true);

    engine.startGame();
    engine.state = 'VOTING';

    // Everyone votes (tie: no one eliminated)
    engine.players[0].votedFor = 'user2';
    engine.players[1].votedFor = 'user3';
    engine.players[2].votedFor = 'user1';

    ImpostorVotingLogic.processVotes(engine);

    expect(engine.state as string).toBe('RESULTS');
    expect(engine.timeRemaining).toBe(10);
    expect(engine.timerInterval).not.toBeNull();
  });
});

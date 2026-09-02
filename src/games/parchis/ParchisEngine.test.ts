import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ParchisEngine } from './ParchisEngine.js';
import { ParchisBoardLogic } from './ParchisBoardLogic.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';

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

  it('should block rollDice when isTurnTransitioning is true', () => {
    engine.addPlayer('user1', 'socket1', 'Alice', 1, '#ff0000');
    engine.addPlayer('user2', 'socket2', 'Bob', 2, '#00ff00');
    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;
    engine.availableMoves = [];
    engine.diceValue = [];

    engine.isTurnTransitioning = true;
    engine.rollDice('user1');

    // Dice should NOT have been rolled because isTurnTransitioning is true
    expect(engine.diceValue.length).toBe(0);
    expect(engine.availableMoves.length).toBe(0);
  });

  describe('Salida y Seguros Math Formulas Audit', () => {
    it('should compute exact startPos for 4, 6 and 8 board sizes', () => {
      // Formula: ((colorIndex % engine.sides) * 17) + 12
      const testCases: { sides: 4 | 6 | 8; expected: number[] }[] = [
        { sides: 4, expected: [12, 29, 46, 63] },
        { sides: 6, expected: [12, 29, 46, 63, 80, 97] },
        { sides: 8, expected: [12, 29, 46, 63, 80, 97, 114, 131] },
      ];

      for (const tc of testCases) {
        engine.rules.parchisBoardSize = tc.sides;
        expect(engine.sides).toBe(tc.sides);
        expect(engine.trackLength).toBe(tc.sides * 17);

        for (let colorIdx = 0; colorIdx < tc.sides; colorIdx++) {
          const computedStartPos = ((colorIdx % engine.sides) * 17) + 12;
          expect(computedStartPos).toBe(tc.expected[colorIdx]);
        }
      }
    });

    it('should compute safeZones = [base + 4, base + 8, base + 12] for all sides', () => {
      const sizes = [4, 6, 8] as const;

      for (const size of sizes) {
        engine.players = [];
        for (let i = 0; i < size; i++) {
          engine.addPlayer(`u${i}`, `s${i}`, `Player ${i}`, i, 'yellow');
        }
        engine.startGame({ parchisBoardSize: size });

        const expectedSafeZones: number[] = [];
        for (let i = 0; i < size; i++) {
          const base = i * 17;
          expectedSafeZones.push(base + 4, base + 8, base + 12);
        }

        expect(engine.rules.safeZones).toEqual(expectedSafeZones);
        expect(engine.rules.safeZones.length).toBe(size * 3);
      }
    });
  });

  describe('Exit from HOME logic (Colombian pair rules & 1-die 5 rule)', () => {
    beforeEach(() => {
      engine.players = [];
      engine.addPlayer('u1', 's1', 'Player 1', 1, 'yellow');
      engine.addPlayer('u2', 's2', 'Player 2', 2, 'blue');
      engine.state = 'PLAYING';
      engine.currentTurnIndex = 0;
      engine.rules.parchisBoardSize = 4;
      engine.rules.safeBlocks = true;
    });

    it('should exit ALL tokens on 1-1 or 6-6 in 2-dice mode (Colombian rule)', () => {
      engine.rules.diceCount = 2;
      const player = engine.players[0];
      player.tokens = [
        { id: 't0', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't1', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't2', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't3', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
      ];

      // Test 1-1
      engine.diceValue = [1, 1];
      engine.availableMoves = [1, 1];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 1);

      expect(player.tokens.every(t => t.state === 'BOARD' && t.position === 12)).toBe(true);
      expect(engine.availableMoves.length).toBe(0);

      // Reset and test 6-6
      engine.state = 'PLAYING';
      engine.currentTurnIndex = 0;
      player.tokens.forEach(t => { t.state = 'HOME'; t.position = -1; });
      engine.diceValue = [6, 6];
      engine.availableMoves = [6, 6];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 6);

      expect(player.tokens.every(t => t.state === 'BOARD' && t.position === 12)).toBe(true);
      expect(engine.availableMoves.length).toBe(0);
    });

    it('should exit UP TO 2 tokens on other pairs (2-2, 3-3, 4-4, 5-5) in 2-dice mode', () => {
      engine.rules.diceCount = 2;
      const player = engine.players[0];
      player.tokens = [
        { id: 't0', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't1', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't2', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't3', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
      ];

      engine.diceValue = [3, 3];
      engine.availableMoves = [3, 3];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 3);

      const onBoard = player.tokens.filter(t => t.state === 'BOARD');
      const inHome = player.tokens.filter(t => t.state === 'HOME');
      expect(onBoard.length).toBe(2);
      expect(inHome.length).toBe(2);
      expect(onBoard.every(t => t.position === 12)).toBe(true);
      expect(engine.availableMoves.length).toBe(0);
    });

    it('should NOT exit on non-pair roll in 2-dice mode', () => {
      engine.rules.diceCount = 2;
      const player = engine.players[0];
      player.tokens = [
        { id: 't0', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' }
      ];

      engine.diceValue = [5, 2];
      engine.availableMoves = [5, 2];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 5);

      expect(player.tokens[0].state).toBe('HOME');
      expect(engine.availableMoves).toEqual([5, 2]);
    });

    it('should exit 1 token on roll of 5 in 1-die mode', () => {
      engine.rules.diceCount = 1;
      const player = engine.players[0];
      player.tokens = [
        { id: 't0', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' },
        { id: 't1', color: 'yellow', ownerId: 'u1', position: -1, state: 'HOME' }
      ];

      // Non-5 roll (e.g. 4)
      engine.diceValue = [4];
      engine.availableMoves = [4];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 4);
      expect(player.tokens[0].state).toBe('HOME');

      // 5 roll
      engine.diceValue = [5];
      engine.availableMoves = [5];
      ParchisBoardLogic.moveToken(engine, 'u1', 't0', 5);
      expect(player.tokens[0].state).toBe('BOARD');
      expect(player.tokens[0].position).toBe(12);
      expect(player.tokens[1].state).toBe('HOME');
    });
  });

  describe('Full Circuit and Meta Corridor Entry Audit', () => {
    const runFullTrackTest = (sides: 4 | 6 | 8) => {
      const colors = ['yellow', 'blue', 'red', 'green', 'purple', 'orange', 'pink', 'cyan'];
      const trackLength = sides * 17;

      for (let colorIdx = 0; colorIdx < sides; colorIdx++) {
        const testEngine = new ParchisEngine('room_track', {} as any);
        testEngine.rules = {
          diceCount: 1,
          tokensPerPlayer: 4,
          parchisBoardSize: sides,
          safeZones: [],
          exactMeta: true,
          captureReward: 0,
          crownReward: 0
        };

        for (let i = 0; i < sides; i++) {
          testEngine.addPlayer(`user_${i}`, `sock_${i}`, `P${i}`, i, colors[i]);
        }

        testEngine.state = 'PLAYING';
        testEngine.currentTurnIndex = colorIdx;
        const player = testEngine.players[colorIdx];
        player.tokens = [
          { id: `t_${colorIdx}`, color: colors[colorIdx], ownerId: player.userId, position: -1, state: 'HOME' }
        ];

        const expectedStartPos = (colorIdx * 17) + 12;

        // 1. Exit from HOME with a 5
        testEngine.diceValue = [5];
        testEngine.availableMoves = [5];
        ParchisBoardLogic.moveToken(testEngine, player.userId, `t_${colorIdx}`, 5);

        const token = player.tokens[0];
        expect(token.state).toBe('BOARD');
        expect(token.position).toBe(expectedStartPos);

        // 2. Step through the entire circular track: exactly trackLength - 1 steps (67, 101, or 135)
        for (let step = 1; step < trackLength; step++) {
          testEngine.currentTurnIndex = colorIdx;
          testEngine.diceValue = [1];
          testEngine.availableMoves = [1];

          ParchisBoardLogic.moveToken(testEngine, player.userId, `t_${colorIdx}`, 1);
          expect(token.state).toBe('BOARD');
          const expectedBoardPos = (expectedStartPos + step) % trackLength;
          expect(token.position).toBe(expectedBoardPos);
        }

        // The token is now at the last square before meta corridor (expectedStartPos - 1 + trackLength) % trackLength
        const lastSquareBeforeMeta = (expectedStartPos - 1 + trackLength) % trackLength;
        expect(token.position).toBe(lastSquareBeforeMeta);

        // 3. Step 68 (or 102 / 136): Enters META corridor at index 0 of its OWN color
        testEngine.currentTurnIndex = colorIdx;
        testEngine.diceValue = [1];
        testEngine.availableMoves = [1];
        ParchisBoardLogic.moveToken(testEngine, player.userId, `t_${colorIdx}`, 1);

        expect(token.state).toBe('META');
        expect(token.position).toBe(0);

        // 4. Advance through META corridor from 0 to 7
        for (let metaStep = 1; metaStep <= 7; metaStep++) {
          testEngine.currentTurnIndex = colorIdx;
          testEngine.diceValue = [1];
          testEngine.availableMoves = [1];
          ParchisBoardLogic.moveToken(testEngine, player.userId, `t_${colorIdx}`, 1);

          expect(token.state).toBe('META');
          expect(token.position).toBe(metaStep);
        }

        // 5. Crown on 8th step inside META -> FINISHED
        testEngine.currentTurnIndex = colorIdx;
        testEngine.diceValue = [1];
        testEngine.availableMoves = [1];
        ParchisBoardLogic.moveToken(testEngine, player.userId, `t_${colorIdx}`, 1);

        expect(token.state).toBe('FINISHED');
        expect(player.stats.crowned).toBe(1);
      }
    };

    it('should complete full circuit and enter exact meta for 4-player board', () => {
      runFullTrackTest(4);
    });

    it('should complete full circuit and enter exact meta for 6-player board', () => {
      runFullTrackTest(6);
    });

    it('should complete full circuit and enter exact meta for 8-player board', () => {
      runFullTrackTest(8);
    });

    it('should correctly evaluate hasAnyValidMove for direct board-to-finish transitions', () => {
      engine.rules.parchisBoardSize = 4;
      engine.rules.diceCount = 1;
      engine.players = [];
      engine.addPlayer('u1', 's1', 'Player 1', 1, 'yellow');
      engine.state = 'PLAYING';
      engine.currentTurnIndex = 0;

      const player = engine.players[0];
      // Color 0 startPos = 12. Last square before meta = 11.
      player.tokens = [
        { id: 't0', color: 'yellow', ownerId: 'u1', position: 11, state: 'BOARD' }
      ];

      // Moving 9 steps from square 11 reaches FINISHED (67 + 9 - 67 - 1 = 8)
      engine.availableMoves = [9];
      expect(ParchisTurnLogic.hasAnyValidMove(engine, player)).toBe(true);

      // Moving 10 steps overshoots FINISHED (67 + 10 - 67 - 1 = 9 > 8)
      engine.availableMoves = [10];
      expect(ParchisTurnLogic.hasAnyValidMove(engine, player)).toBe(false);
    });
  });
});

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ParchisEngine } from '../../../games/parchis/ParchisEngine.js';
import { ParchisTurnLogic } from '../../../games/parchis/ParchisTurnLogic.js';
import { ParchisBot } from './ParchisBot.js';

describe('ParchisBot', () => {
  let engine: ParchisEngine;
  let bot: ParchisBot;

  beforeEach(() => {
    engine = new ParchisEngine('test-parchis-room', {} as any);
    bot = new ParchisBot(
      { difficultyLevel: 10, roomId: 'test-parchis-room', gameType: 'parchis', existingUserId: 'bot-1' },
      'ChefBot',
      1,
      'yellow'
    );
    // Override think to resolve immediately during tests
    (bot as any).think = () => Promise.resolve();
  });

  it('should instantiate correctly and bind engine', () => {
    bot.setEngine(engine);
    expect(bot.userId).toBe('bot-1');
    expect(bot.nickname).toBe('ChefBot');
  });

  it('should choose an available figure during CHOOSING_TOKENS', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');

    bot.setEngine(engine);
    engine.startGame({ parchisBoardSize: 4 });

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(engine.state).toBe('CHOOSING_TOKENS');

    // Bot should pick a figure automatically when state updates
    const me = engine.players.find(p => p.userId === 'bot-1');
    expect(me?.hasChosenFigure).toBe(true);
    expect(me?.selectedFigure).toBeDefined();
  });

  it('should roll initiative during ROLLING_FOR_ORDER', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('bot-2', 'sock-2', 'Bot2', 2, 'red');

    const bot2 = new ParchisBot(
      { difficultyLevel: 10, roomId: 'test-parchis-room', gameType: 'parchis', existingUserId: 'bot-2' },
      'Bot2',
      2,
      'red'
    );
    (bot2 as any).think = () => Promise.resolve();

    bot.setEngine(engine);
    bot2.setEngine(engine);

    engine.startGame({ parchisBoardSize: 4 });

    await new Promise(resolve => setTimeout(resolve, 50));

    // Both bots choose figure, transitioning to ROLLING_FOR_ORDER
    expect(engine.state === 'ROLLING_FOR_ORDER' || engine.state === 'CHOOSING_SEATS' || engine.state === 'PLAYING').toBe(true);
    expect(engine.initiativeRolls['bot-1']).toBeDefined();
    expect(engine.initiativeRolls['bot-2']).toBeDefined();
  });

  it('should choose seat when firstPicker in CHOOSING_SEATS', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');
    bot.setEngine(engine);

    engine.state = 'CHOOSING_SEATS';
    engine.pickersQueue = ['bot-1', 'user-2'];
    engine.firstPickerUserId = 'bot-1';
    engine.takenSeats = [];

    engine.broadcastState();

    // Give microtask queue time to process
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(engine.takenSeats.length).toBeGreaterThan(0);
  });

  it('should roll dice when turn starts and no dice are rolled', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');
    bot.setEngine(engine);

    const rollSpy = mock((userId: string) => {
      ParchisTurnLogic.rollDice(engine, userId);
    });
    engine.rollDice = rollSpy;

    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;
    engine.diceValue = [];
    engine.availableMoves = [];
    engine.players[0].tokens = [
      { id: 'bot-1-token-0', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' }
    ];

    engine.broadcastState();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(rollSpy).toHaveBeenCalled();
  });

  it('should move token out of HOME on pair roll (2 dice rules)', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');
    bot.setEngine(engine);

    engine.rules.diceCount = 2;
    engine.rules.safeBlocks = true;
    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;
    engine.diceValue = [6, 6];
    engine.availableMoves = [6, 6];
    engine.players[0].tokens = [
      { id: 'bot-1-token-0', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' },
      { id: 'bot-1-token-1', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' },
      { id: 'bot-1-token-2', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' },
      { id: 'bot-1-token-3', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' }
    ];

    engine.broadcastState();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Tokens should have exited home to start position (startPos = 12 for yellow/index 0)
    const tokensOnBoard = engine.players[0].tokens.filter(t => t.state === 'BOARD');
    expect(tokensOnBoard.length).toBeGreaterThan(0);
    expect(tokensOnBoard[0].position).toBe(12);
  });

  it('should prioritize capture over simple advance', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');
    bot.setEngine(engine);

    engine.rules.diceCount = 1;
    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;

    // Bot token A is at position 10. Dice is 4 -> reaches 14 (safe / normal)
    // Bot token B is at position 20. Dice is 4 -> reaches 24 (enemy token is here!)
    // Enemy token is at position 24 (not a safe zone in 4-player: safeZones are 4, 12, 21, 29...)
    engine.players[0].tokens = [
      { id: 'bot-1-token-0', color: 'yellow', ownerId: 'bot-1', position: 10, state: 'BOARD' },
      { id: 'bot-1-token-1', color: 'yellow', ownerId: 'bot-1', position: 20, state: 'BOARD' }
    ];
    engine.players[1].tokens = [
      { id: 'user-2-token-0', color: 'red', ownerId: 'user-2', position: 24, state: 'BOARD' }
    ];

    engine.diceValue = [4];
    engine.availableMoves = [4];

    engine.broadcastState();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Token 1 should have moved to 24 and captured enemy
    const token1 = engine.players[0].tokens.find(t => t.id === 'bot-1-token-1');
    expect(token1?.position).toBe(24);

    const enemyToken = engine.players[1].tokens.find(t => t.id === 'user-2-token-0');
    expect(enemyToken?.state).toBe('HOME');
    expect(enemyToken?.position).toBe(-1);
  });

  it('should trigger failsafe and pass turn if no moves can be made with available moves', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    engine.addPlayer('user-2', 'sock-2', 'Player 2', 2, 'red');
    bot.setEngine(engine);

    engine.rules.diceCount = 1;
    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;

    // All bot tokens in HOME, rolled a 3 (cannot exit on 3 in 1-die mode)
    engine.players[0].tokens = [
      { id: 'bot-1-token-0', color: 'yellow', ownerId: 'bot-1', position: -1, state: 'HOME' }
    ];

    engine.diceValue = [3];
    engine.availableMoves = [3];

    engine.broadcastState();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Failsafe should clear availableMoves and advance turn
    expect(engine.availableMoves.length).toBe(0);
    expect(engine.currentTurnIndex).toBe(1);
  });

  it('should prevent re-entrant/concurrent execution via isActing lock', async () => {
    engine.addPlayer('bot-1', 'sock-1', 'ChefBot', 1, 'yellow');
    bot.setEngine(engine);

    let concurrentCount = 0;
    let maxConcurrent = 0;
    (bot as any).think = async () => {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      await new Promise(resolve => setTimeout(resolve, 30));
      concurrentCount--;
    };

    engine.state = 'CHOOSING_TOKENS';
    engine.players[0].hasChosenFigure = false;

    // Fire multiple rapid game_state_update events
    engine.broadcastState();
    engine.broadcastState();
    engine.broadcastState();

    await new Promise(resolve => setTimeout(resolve, 100));

    // maxConcurrent should never exceed 1
    expect(maxConcurrent).toBe(1);
  });

  it('should run a multi-turn 4-bot simulation in PLAYING state without deadlocks or errors', async () => {
    const bots: ParchisBot[] = [];
    const colors = ['yellow', 'blue', 'red', 'green'];

    for (let i = 1; i <= 4; i++) {
      const b = new ParchisBot(
        { difficultyLevel: 10, roomId: 'test-parchis-room', gameType: 'parchis', existingUserId: `bot-${i}` },
        `Bot ${i}`,
        i,
        colors[i - 1]
      );
      (b as any).think = () => Promise.resolve();
      bots.push(b);
      engine.addPlayer(`bot-${i}`, `sock-${i}`, `Bot ${i}`, i, colors[i - 1]);
    }

    bots.forEach(b => b.setEngine(engine));

    // Initialize in PLAYING mode
    engine.rules.diceCount = 2;
    engine.rules.safeBlocks = true;
    engine.state = 'PLAYING';
    engine.currentTurnIndex = 0;
    engine.diceValue = [];
    engine.availableMoves = [];

    engine.players.forEach((p, pIdx) => {
      p.tokens = Array.from({ length: 4 }, (_, tIdx) => ({
        id: `${p.userId}-token-${tIdx}`,
        color: p.color,
        ownerId: p.userId,
        position: -1,
        state: 'HOME'
      }));
    });

    // Run 30 turn iterations
    for (let turn = 0; turn < 30; turn++) {
      if ((engine.state as any) === 'FINISHED') break;
      engine.broadcastState();
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Engine should still be valid and playing or finished without exceptions
    expect(['PLAYING', 'FINISHED']).toContain(engine.state as any);
  });
});

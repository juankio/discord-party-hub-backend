import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { LiarsEngine } from './LiarsEngine.js';
import { LiarsPlayLogic } from './LiarsPlayLogic.js';
import { LiarsBot } from '../../core/bots/liars/LiarsBot.js';

describe('LiarsBar - Logic & Bot Tests', () => {
  let engine: LiarsEngine;

  beforeEach(() => {
    engine = new LiarsEngine('room-liars-1', {} as any);
  });

  it('isValidBid should handle both count and amount fields correctly', () => {
    expect(LiarsPlayLogic.isValidBid(null, 1, 2)).toBe(true);
    expect(LiarsPlayLogic.isValidBid({ userId: 'u1', count: 2, face: 3 }, 2, 4)).toBe(true);
    expect(LiarsPlayLogic.isValidBid({ userId: 'u1', count: 2, face: 3 }, 3, 2)).toBe(true);
    expect(LiarsPlayLogic.isValidBid({ userId: 'u1', count: 2, face: 3 }, 2, 3)).toBe(false);
    expect(LiarsPlayLogic.isValidBid({ userId: 'u1', count: 2, face: 3 }, 1, 4)).toBe(false);
    
    // Compatibility with amount field
    expect(LiarsPlayLogic.isValidBid({ userId: 'u1', count: 0, amount: 2, face: 3 } as any, 2, 5)).toBe(true);
  });

  it('getPublicState should return fully compatible fields (currentBet, currentBid, winnerId, loserId)', () => {
    const players = [
      { userId: 'u1', socketId: 's1', nickname: 'Alice', avatarId: 1, color: '#ff0000', diceCount: 5, dice: [2, 3, 4, 5, 6], isEliminated: false },
      { userId: 'u2', socketId: 's2', nickname: 'Bob', avatarId: 2, color: '#00ff00', diceCount: 5, dice: [1, 2, 2, 3, 4], isEliminated: false }
    ];

    const currentBid = { userId: 'u1', count: 3, face: 2 };
    const state = LiarsPlayLogic.getPublicState(
      'u1',
      'BETTING',
      players,
      'u1',
      currentBid,
      'u1',
      'u1',
      'u2',
      { initialDice: 5, onesAreWild: true }
    );

    expect(state.currentBet).not.toBeNull();
    expect(state.currentBet?.count).toBe(3);
    expect(state.currentBet?.amount).toBe(3);
    expect(state.currentBet?.playerId).toBe('u1');
    expect(state.currentBet?.userId).toBe('u1');

    expect(state.currentBid).not.toBeNull();
    expect(state.currentBid?.count).toBe(3);
    expect(state.currentBid?.amount).toBe(3);

    expect(state.winner).toBe('u1');
    expect(state.winnerId).toBe('u1');
    expect(state.roundWinner).toBe('u1');
    expect(state.roundWinnerId).toBe('u1');
    expect(state.roundLoser).toBe('u2');
    expect(state.loserId).toBe('u2');
    expect(state.roundLoserId).toBe('u2');
  });

  it('resolveCallLiar should return full compatibility mapping', () => {
    const players = [
      { userId: 'u1', socketId: 's1', nickname: 'Alice', avatarId: 1, color: '#ff0000', diceCount: 5, dice: [2, 2, 2, 5, 6], isEliminated: false },
      { userId: 'u2', socketId: 's2', nickname: 'Bob', avatarId: 2, color: '#00ff00', diceCount: 5, dice: [1, 3, 3, 4, 4], isEliminated: false }
    ];

    // u1 bid 4 twos (u1 has 3 twos, u2 has 1 wild (one) -> total 4 twos). u2 calls liar.
    const result = LiarsPlayLogic.resolveCallLiar(
      players,
      { userId: 'u1', count: 4, face: 2 },
      'u2',
      { initialDice: 5, onesAreWild: true }
    );

    expect(result.totalFound).toBe(4);
    expect(result.loserId).toBe('u2');
    expect(result.winnerId).toBe('u1');
    expect(result.winner).toBe('u1');
    expect(result.loser).toBe('u2');
  });

  it('LiarsBot should recognize existing state.currentBet and place a valid higher bid or call liar instead of 1x2', async () => {
    const bot = new LiarsBot(
      { existingUserId: 'bot-1', roomId: 'room-liars-1', gameType: 'liars', difficultyLevel: 5 },
      'ChefBot',
      1,
      '#ff0000'
    );

    bot.setEngine(engine);

    let placedBid: { count: number; face: number } | null = null;
    let calledLiar = false;

    engine.placeBid = (userId: string, count: number, face: number) => {
      placedBid = { count, face };
    };
    engine.callLiar = (userId: string) => {
      calledLiar = true;
    };

    // Simulate state where previous player bet 2 of face 3
    const gameState = {
      state: 'BETTING',
      currentTurnId: 'bot-1',
      currentBet: { userId: 'player-1', playerId: 'player-1', count: 2, amount: 2, face: 3 },
      totalDiceCount: 10,
      myDice: [3, 3, 4, 5, 6],
      rules: { initialDice: 5, onesAreWild: true }
    };

    await (bot as any).onGameStateUpdate({ targetUserId: 'bot-1', state: gameState });

    // Bot must NOT place 1x2 (initial invalid bid), it must either raise or call liar
    if (placedBid) {
      expect(LiarsPlayLogic.isValidBid(gameState.currentBet, (placedBid as any).count, (placedBid as any).face)).toBe(true);
      expect((placedBid as any).count >= 2).toBe(true);
    } else {
      expect(calledLiar).toBe(true);
    }
  });
});

import type { StopEngine } from './StopEngine.js';
import type { PlayerAnswers, StopRules, StopPublicState, StopPlayerState } from './StopTypes.js';
import { StopValidationLogic } from './StopValidationLogic.js';

export class StopUtils {
  static cleanAnswers(rules: StopRules, answers: PlayerAnswers): PlayerAnswers {
    const cleaned: PlayerAnswers = {};
    for (const cat of rules.categories) {
      const val = answers[cat];
      cleaned[cat] = typeof val === 'string' ? val.trim().toLowerCase() : '';
    }
    return cleaned;
  }

  static stopCall(engine: StopEngine, userId: string, answers: PlayerAnswers) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player) return;

    player.currentAnswers = StopUtils.cleanAnswers(engine.rules, answers);
    player.submitted = true;

    engine.emit('stop_called', { userId: player.userId });

    const humanPlayers = engine.players.filter(p => !p.isOffline && !p.userId.startsWith('bot_'));
    const allSubmitted = humanPlayers.length === 0 || humanPlayers.every(p => p.submitted);

    if (allSubmitted) {
      if (engine.collectingTimeout) {
        clearTimeout(engine.collectingTimeout);
        engine.collectingTimeout = null;
      }
      StopValidationLogic.startVerifying(engine);
    } else if (!engine.collectingTimeout) {
      engine.collectingTimeout = setTimeout(() => {
        engine.collectingTimeout = null;
        StopValidationLogic.startVerifying(engine);
      }, 3000);
    }
  }

  static submitAnswers(engine: StopEngine, userId: string, answers: PlayerAnswers) {
    if (engine.state !== 'PLAYING') return;
    const player = engine.players.find(p => p.userId === userId);
    if (!player) return;
    
    player.currentAnswers = StopUtils.cleanAnswers(engine.rules, answers);
    player.submitted = true;

    const humanPlayers = engine.players.filter(p => !p.isOffline && !p.userId.startsWith('bot_'));
    const allSubmitted = humanPlayers.length === 0 || humanPlayers.every(p => p.submitted);
    
    if (allSubmitted) {
      if (engine.collectingTimeout) {
        clearTimeout(engine.collectingTimeout);
        engine.collectingTimeout = null;
      }
      StopValidationLogic.startVerifying(engine);
    }
  }

  static getPublicState(engine: StopEngine): StopPublicState {
    let timeRemaining: number | undefined;
    if (engine.verifyingDeadline) {
      timeRemaining = Math.max(0, engine.verifyingDeadline - Date.now());
    }

    return {
      state: engine.state,
      players: engine.players.map(p => ({
        userId: p.userId, nickname: p.nickname, avatarId: p.avatarId,
        color: p.color, isOffline: p.isOffline, score: p.score,
        invalidatedCount: p.invalidatedCount, submitted: p.submitted
      })),
      currentRound: engine.currentRound, totalRounds: engine.rules.rounds,
      currentLetter: engine.currentLetter, categories: engine.rules.categories,
      verifyingCategoryIndex: 0,
      verifyingData: engine.verifyingData.length > 0 ? engine.verifyingData : null,
      roundScores: Object.keys(engine.roundScores).length > 0 ? engine.roundScores : null,
      winnerId: engine.winnerId, timeRemaining
    };
  }

  static endGame(engine: StopEngine) {
    engine.state = 'FINISHED';
    
    if (engine.collectingTimeout) {
      clearTimeout(engine.collectingTimeout);
      engine.collectingTimeout = null;
    }
    if (engine.verifyingTimeout) {
      clearTimeout(engine.verifyingTimeout);
      engine.verifyingTimeout = null;
    }
    
    let maxScore = -1;
    let winner: StopPlayerState | null = null;
    for (const p of engine.players) {
      if (p.score > maxScore) {
        maxScore = p.score;
        winner = p;
      }
    }
    
    if (winner) {
      engine.winnerId = winner.userId;
      engine.emit('player_won', winner.userId);
    }
    
    engine.broadcastState();
  }
}

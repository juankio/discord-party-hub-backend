import type { ImpostorEngine } from './ImpostorEngine.js';
import { ImpostorVotingLogic } from './ImpostorVotingLogic.js';
import type { ImpostorPublicState, ImpostorPrivateState } from './ImpostorTypes.js';

export const MIN_PLAYERS = 2;

export class ImpostorUtils {
  static removePlayer(engine: ImpostorEngine, userId: string) {
    engine.players = engine.players.filter(p => p.userId !== userId);
    if (engine.state !== 'WAITING' && engine.state !== 'FINISHED') {
      if (userId === engine.impostorUserId) {
        ImpostorVotingLogic.endGame(engine, 'innocents');
        return;
      }
      const alive = engine.players.filter(p => p.isAlive);
      if (alive.length < MIN_PLAYERS - 1) {
        ImpostorVotingLogic.endGame(engine, 'innocents');
        return;
      }
    }
  }

  static getPublicState(engine: ImpostorEngine): ImpostorPublicState {
    return {
      state: engine.state,
      currentRound: engine.currentRound,
      maxRounds: engine.maxRounds,
      timeRemaining: engine.timeRemaining,
      players: engine.players.map(p => ({
        id: p.userId,
        userId: p.userId,
        name: p.nickname,
        nickname: p.nickname,
        avatarId: p.avatarId,
        color: p.color,
        hasVoted: p.hasVoted || false,
        isAlive: p.isAlive || false,
      })),
      roundResults: engine.roundResults,
      winner: engine.winner,
      impostorUserId: engine.state === 'FINISHED' ? (engine.impostorUserId || undefined) : undefined,
    };
  }

  static broadcastState(engine: ImpostorEngine) {
    for (const p of engine.players) {
      const publicState = ImpostorUtils.getPublicState(engine);
      const privateState: ImpostorPrivateState = {
        ...publicState,
        myWord: p.assignedWord || '',
        amImpostor: p.isImpostor || false,
      };

      if (engine.state !== 'FINISHED') {
        privateState.impostorUserId = undefined;
      }

      engine.emit('game_state_update', {
        targetUserId: p.userId,
        state: privateState,
      });
    }
  }

  static returnToLobby(engine: ImpostorEngine) {
    engine.stopTimer();
    engine.state = 'WAITING';
    engine.currentRound = 0;
    engine.roundResults = [];
    engine.winner = null;
    engine.impostorUserId = null;
    engine.players.forEach(p => {
      p.assignedWord = undefined;
      p.isImpostor = undefined;
      p.hasVoted = false;
      p.votedFor = undefined;
      p.isAlive = true;
    });
    engine.broadcastState();
    engine.emit('return_to_lobby', null);
  }
}
export const RESULTS_DURATION = 10;
export const WORDS_REVEAL_DURATION = 5;

import { ImpostorEngine } from './ImpostorEngine.js';
import { MIN_PLAYERS, RESULTS_DURATION } from './ImpostorUtils.js';
import type { ImpostorRoundResult, WordEntry } from './ImpostorTypes.js';
import { ImpostorRolesLogic } from './ImpostorRolesLogic.js';
import wordsData from './words.json';

const WORDS: WordEntry[] = wordsData as WordEntry[];

export class ImpostorVotingLogic {
  static vote(engine: ImpostorEngine, voterId: string, targetId: string) {
    if (engine.state !== 'VOTING') return;

    const voter = engine.players.find(p => p.userId === voterId);
    if (!voter || !voter.isAlive || voter.hasVoted) return;

    if (voterId === targetId) return;

    const target = engine.players.find(p => p.userId === targetId);
    if (!target || !target.isAlive) return;

    voter.hasVoted = true;
    voter.votedFor = targetId;

    engine.broadcastState();

    const alivePlayers = engine.players.filter(p => p.isAlive);
    if (alivePlayers.every(p => p.hasVoted)) {
      ImpostorVotingLogic.processVotes(engine);
    }
  }

  static processVotes(engine: ImpostorEngine) {
    engine.stopTimer();

    const alivePlayers = engine.players.filter(p => p.isAlive);
    const voteCount: Record<string, number> = {};
    for (const p of alivePlayers) {
      if (p.votedFor) {
        voteCount[p.votedFor] = (voteCount[p.votedFor] || 0) + 1;
      }
    }

    let maxVotes = 0;
    let mostVotedUserId: string | null = null;
    let tieCount = 0;

    for (const [userId, votes] of Object.entries(voteCount)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        mostVotedUserId = userId;
        tieCount = 1;
      } else if (votes === maxVotes) {
        tieCount++;
      }
    }

    const eliminatedUserId = (tieCount > 1 || !mostVotedUserId || maxVotes === 0)
      ? undefined : mostVotedUserId;

    let wasImpostor = false;
    if (eliminatedUserId) {
      const eliminated = engine.players.find(p => p.userId === eliminatedUserId);
      if (eliminated) {
        eliminated.isAlive = false;
        wasImpostor = eliminated.userId === engine.impostorUserId;
      }
    }

    const wordEntry = WORDS.find(w => {
      const alive = engine.players.find(p => p.isAlive || p.userId === eliminatedUserId);
      return alive?.isImpostor ? w.pista === alive.assignedWord : w.palabra === alive?.assignedWord;
    });

    const result: ImpostorRoundResult = {
      round: engine.currentRound,
      votes: voteCount,
      eliminatedUserId,
      wasImpostor,
      word: engine.players.find(p => !p.isImpostor && p.assignedWord)?.assignedWord || '???',
    };
    engine.roundResults.push(result);

    engine.state = 'RESULTS';
    engine.timeRemaining = RESULTS_DURATION;

    if (eliminatedUserId) {
      const eliminated = engine.players.find(p => p.userId === eliminatedUserId);
      if (wasImpostor) {
        engine.broadcastMessage(`🚨 ${eliminated?.nickname} era EL IMPOSTOR! La palabra era "${result.word}". ¡Los inocentes ganan!`);
      } else {
        engine.broadcastMessage(`❌ ${eliminated?.nickname} fue eliminado/a, pero NO era el impostor. Quedan ${engine.maxRounds - engine.currentRound} ronda(s).`);
      }
    } else {
      engine.broadcastMessage(`🤝 ¡Empate! Nadie fue eliminado esta ronda. La palabra era "${result.word}".`);
    }

    engine.broadcastState();

    if (wasImpostor) {
      engine.timerInterval = setTimeout(() => ImpostorVotingLogic.endGame(engine, 'innocents'), RESULTS_DURATION * 1000);
      return;
    }

    if (engine.currentRound >= engine.maxRounds) {
      engine.timerInterval = setTimeout(() => ImpostorVotingLogic.endGame(engine, 'impostor'), RESULTS_DURATION * 1000);
      return;
    }

    const aliveAfter = engine.players.filter(p => p.isAlive);
    if (aliveAfter.length < MIN_PLAYERS - 1) {
      engine.timerInterval = setTimeout(() => ImpostorVotingLogic.endGame(engine, 'innocents'), RESULTS_DURATION * 1000);
      return;
    }

    engine.timerInterval = setTimeout(() => ImpostorRolesLogic.startNewRound(engine), RESULTS_DURATION * 1000);
  }

  static endGame(engine: ImpostorEngine, winner: 'innocents' | 'impostor') {
    engine.stopTimer();
    engine.state = 'FINISHED';
    engine.winner = winner;

    const impostor = engine.players.find(p => p.userId === engine.impostorUserId);
    if (winner === 'impostor') {
      engine.broadcastMessage(`🎭 ¡El impostor era ${impostor?.nickname} y logró engañar a todos!`);
    } else {
      engine.broadcastMessage(`🎉 ¡Los inocentes atraparon al impostor! ${impostor?.nickname} era el impostor.`);
    }

    engine.broadcastState();
    engine.emit('player_won', winner === 'innocents' ? ImpostorVotingLogic.getAliveInnocentId(engine) : engine.impostorUserId);
  }

  static getAliveInnocentId(engine: ImpostorEngine): string | null {
    const alive = engine.players.find(p => p.isAlive && !p.isImpostor);
    return alive?.userId || null;
  }
}

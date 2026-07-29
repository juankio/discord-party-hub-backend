import { ImpostorEngine } from './ImpostorEngine.js';
import { MIN_PLAYERS, WORDS_REVEAL_DURATION } from './ImpostorUtils.js';
import wordsData from './words.json';
import type { WordEntry } from './ImpostorTypes.js';

const WORDS: WordEntry[] = wordsData as WordEntry[];

export class ImpostorRolesLogic {
  static startGame(engine: ImpostorEngine) {
    if (engine.players.length < MIN_PLAYERS) {
      engine.broadcastMessage(`Se necesitan al menos ${MIN_PLAYERS} jugadores para empezar.`);
      engine.state = 'WAITING';
      engine.broadcastState();
      return;
    }

    engine.currentRound = 0;
    engine.roundResults = [];
    engine.winner = null;
    engine.impostorUserId = null;

    // Reset state for all players
    engine.players.forEach(p => {
      p.isAlive = true;
      p.hasVoted = false;
      p.votedFor = undefined;
      p.assignedWord = undefined;
      p.isImpostor = undefined;
    });

    ImpostorRolesLogic.startNewRound(engine);
  }

  static startNewRound(engine: ImpostorEngine) {
    engine.currentRound++;

    const wordEntry = WORDS[Math.floor(Math.random() * WORDS.length)];
    if (!wordEntry) {
      engine.broadcastMessage('Error: no hay palabras disponibles.');
      return;
    }

    const alivePlayers = engine.players.filter(p => p.isAlive);
    const randomIndex = Math.floor(Math.random() * alivePlayers.length);
    const impostor = alivePlayers[randomIndex];
    if (!impostor) return;

    engine.impostorUserId = impostor.userId;

    engine.players.forEach(p => {
      p.hasVoted = false;
      p.votedFor = undefined;
      if (!p.isAlive) return;

      if (p.userId === impostor.userId) {
        p.assignedWord = wordEntry.pista;
        p.isImpostor = true;
      } else {
        p.assignedWord = wordEntry.palabra;
        p.isImpostor = false;
      }
    });

    engine.state = 'WORDS_REVEALED';
    engine.timeRemaining = WORDS_REVEAL_DURATION;
    engine.broadcastState();
    engine.broadcastMessage(`🔔 Ronda ${engine.currentRound}: ¡Revisen su palabra!`);
    engine.startTimer(() => engine.transitionToDiscussion());
  }
}

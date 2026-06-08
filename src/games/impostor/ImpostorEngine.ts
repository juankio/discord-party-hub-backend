import type {
  WordEntry,
  ImpostorGameState,
  ImpostorPlayer,
  ImpostorRoundResult,
  ImpostorPublicState,
  ImpostorPrivateState,
} from './ImpostorTypes.js';
import wordsData from './words.json';

const WORDS: WordEntry[] = wordsData as WordEntry[];

// Duración de cada fase (en segundos)
const WORDS_REVEAL_DURATION = 5;
const DISCUSSION_DURATION = 120;
const VOTING_DURATION = 30;
const RESULTS_DURATION = 10;
const MAX_ROUNDS = 3;
const MIN_PLAYERS = 3;

export class ImpostorEngine {
  public roomId: string;
  public players: ImpostorPlayer[] = [];
  public state: ImpostorGameState = 'WAITING';

  public currentRound = 0;
  public maxRounds = MAX_ROUNDS;
  public timeRemaining = 0;
  public roundResults: ImpostorRoundResult[] = [];
  public winner: 'innocents' | 'impostor' | null = null;
  public impostorUserId: string | null = null;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  public broadcastCallback: (event: string, data?: any) => void;

  constructor(roomId: string, broadcastCallback: (event: string, data?: any) => void) {
    this.roomId = roomId;
    this.broadcastCallback = broadcastCallback;
  }

  // ──────────────────── Gestión de jugadores ────────────────────

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    const existing = this.players.find(p => p.userId === userId);
    if (existing) {
      existing.socketId = socketId;
      existing.nickname = nickname;
      existing.avatarId = avatarId;
      existing.color = color;
      return;
    }
    if (this.state !== 'WAITING') return; // No se puede unir en medio
    this.players.push({
      userId, socketId, nickname, avatarId, color,
      isAlive: true, hasVoted: false,
    });
  }

  public removePlayer(userId: string) {
    this.players = this.players.filter(p => p.userId !== userId);
    if (this.state !== 'WAITING' && this.state !== 'FINISHED') {
      // Si el impostor se va, ganan los inocentes
      if (userId === this.impostorUserId) {
        this.endGame('innocents');
        return;
      }
      // Si quedan menos de 3 jugadores activos, termina el juego
      const alive = this.players.filter(p => p.isAlive);
      if (alive.length < MIN_PLAYERS - 1) {
        this.endGame('innocents');
        return;
      }
    }
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) this.broadcastState();
  }

  // ──────────────────── Inicio del juego ────────────────────

  public startGame() {
    if (this.players.length < MIN_PLAYERS) {
      this.broadcastCallback('game_message', { message: `Se necesitan al menos ${MIN_PLAYERS} jugadores para empezar.` });
      return;
    }

    this.currentRound = 0;
    this.roundResults = [];
    this.winner = null;
    this.impostorUserId = null;

    // Resetear estado de todos los jugadores
    this.players.forEach(p => {
      p.isAlive = true;
      p.hasVoted = false;
      p.votedFor = undefined;
      p.assignedWord = undefined;
      p.isImpostor = undefined;
    });

    this.startNewRound();
  }

  // ──────────────────── Lógica de rondas ────────────────────

  private startNewRound() {
    this.currentRound++;

    // Seleccionar palabra aleatoria
    const wordEntry = WORDS[Math.floor(Math.random() * WORDS.length)];
    if (!wordEntry) {
      this.broadcastCallback('game_message', { message: 'Error: no hay palabras disponibles.' });
      return;
    }

    // Seleccionar impostor aleatorio entre los vivos
    const alivePlayers = this.players.filter(p => p.isAlive);
    const randomIndex = Math.floor(Math.random() * alivePlayers.length);
    const impostor = alivePlayers[randomIndex];
    if (!impostor) return;

    this.impostorUserId = impostor.userId;

    // Asignar palabras
    this.players.forEach(p => {
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

    // Fase: WORDS_REVEALED
    this.state = 'WORDS_REVEALED';
    this.timeRemaining = WORDS_REVEAL_DURATION;
    this.broadcastState();
    this.broadcastMessage(`🔔 Ronda ${this.currentRound}: ¡Revisen su palabra!`);
    this.startTimer(() => this.transitionToDiscussion());
  }

  private transitionToDiscussion() {
    this.state = 'DISCUSSION';
    this.timeRemaining = DISCUSSION_DURATION;
    this.broadcastMessage('💬 ¡Discusión! Hablen, argumenten y traten de descubrir al impostor.');
    this.broadcastState();
    this.startTimer(() => this.transitionToVoting());
  }

  private transitionToVoting() {
    this.state = 'VOTING';
    this.timeRemaining = VOTING_DURATION;
    this.broadcastMessage('🗳️ ¡Hora de votar! Eligan a quien creen que es el impostor.');
    this.broadcastState();
    this.startTimer(() => this.processVotes());
  }

  // ──────────────────── Votación ────────────────────

  public vote(voterId: string, targetId: string) {
    if (this.state !== 'VOTING') return;

    const voter = this.players.find(p => p.userId === voterId);
    if (!voter || !voter.isAlive || voter.hasVoted) return;

    // No puede votarse a sí mismo
    if (voterId === targetId) return;

    const target = this.players.find(p => p.userId === targetId);
    if (!target || !target.isAlive) return;

    voter.hasVoted = true;
    voter.votedFor = targetId;

    this.broadcastState();

    // Si todos los vivos ya votaron, procesar anticipadamente
    const alivePlayers = this.players.filter(p => p.isAlive);
    if (alivePlayers.every(p => p.hasVoted)) {
      this.processVotes();
    }
  }

  private processVotes() {
    this.stopTimer();

    const alivePlayers = this.players.filter(p => p.isAlive);

    // Contar votos
    const voteCount: Record<string, number> = {};
    for (const p of alivePlayers) {
      if (p.votedFor) {
        voteCount[p.votedFor] = (voteCount[p.votedFor] || 0) + 1;
      }
    }

    // Encontrar al más votado
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

    // Determinar si hay empate
    const eliminatedUserId = (tieCount > 1 || !mostVotedUserId || maxVotes === 0)
      ? undefined
      : mostVotedUserId;

    let wasImpostor = false;
    if (eliminatedUserId) {
      const eliminated = this.players.find(p => p.userId === eliminatedUserId);
      if (eliminated) {
        eliminated.isAlive = false;
        wasImpostor = eliminated.userId === this.impostorUserId;
      }
    }

    const wordEntry = WORDS.find(w => {
      // Buscar la palabra usada en esta ronda
      const alive = this.players.find(p => p.isAlive || p.userId === eliminatedUserId);
      return alive?.isImpostor ? w.pista === alive.assignedWord : w.palabra === alive?.assignedWord;
    });

    const result: ImpostorRoundResult = {
      round: this.currentRound,
      votes: voteCount,
      eliminatedUserId,
      wasImpostor,
      word: this.players.find(p => !p.isImpostor && p.assignedWord)?.assignedWord || '???',
    };
    this.roundResults.push(result);

    // Fase: RESULTS
    this.state = 'RESULTS';
    this.timeRemaining = RESULTS_DURATION;

    if (eliminatedUserId) {
      const eliminated = this.players.find(p => p.userId === eliminatedUserId);
      if (wasImpostor) {
        this.broadcastMessage(`🚨 ${eliminated?.nickname} era EL IMPOSTOR! La palabra era "${result.word}". ¡Los inocentes ganan!`);
      } else {
        this.broadcastMessage(`❌ ${eliminated?.nickname} fue eliminado/a, pero NO era el impostor. Quedan ${this.maxRounds - this.currentRound} ronda(s).`);
      }
    } else {
      this.broadcastMessage(`🤝 ¡Empate! Nadie fue eliminado esta ronda. La palabra era "${result.word}".`);
    }

    this.broadcastState();

    // Verificar condiciones de victoria
    if (wasImpostor) {
      this.timerInterval = setTimeout(() => this.endGame('innocents'), RESULTS_DURATION * 1000);
      return;
    }

    if (this.currentRound >= this.maxRounds) {
      this.timerInterval = setTimeout(() => this.endGame('impostor'), RESULTS_DURATION * 1000);
      return;
    }

    // Verificar si quedan suficientes jugadores
    const aliveAfter = this.players.filter(p => p.isAlive);
    if (aliveAfter.length < MIN_PLAYERS - 1) {
      this.timerInterval = setTimeout(() => this.endGame('innocents'), RESULTS_DURATION * 1000);
      return;
    }

    // Siguiente ronda
    this.timerInterval = setTimeout(() => this.startNewRound(), RESULTS_DURATION * 1000);
  }

  // ──────────────────── Fin del juego ────────────────────

  private endGame(winner: 'innocents' | 'impostor') {
    this.stopTimer();
    this.state = 'FINISHED';
    this.winner = winner;

    const impostor = this.players.find(p => p.userId === this.impostorUserId);
    if (winner === 'impostor') {
      this.broadcastMessage(`🎭 ¡El impostor era ${impostor?.nickname} y logró engañar a todos!`);
    } else {
      this.broadcastMessage(`🎉 ¡Los inocentes atraparon al impostor! ${impostor?.nickname} era el impostor.`);
    }

    this.broadcastState();
    this.broadcastCallback('player_won', winner === 'innocents' ? this.getAliveInnocentId() : this.impostorUserId);
  }

  private getAliveInnocentId(): string | null {
    const alive = this.players.find(p => p.isAlive && !p.isImpostor);
    return alive?.userId || null;
  }

  // ──────────────────── Timer ────────────────────

  private startTimer(onComplete: () => void) {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        onComplete();
      } else {
        // Actualizar el tiempo restante para todos
        this.broadcastState();
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ──────────────────── Broadcast ────────────────────

  public broadcastMessage(msg: string) {
    this.broadcastCallback('game_message', { message: msg });
  }

  public broadcastState() {
    for (const p of this.players) {
      const publicState = this.getPublicState();
      const privateState: ImpostorPrivateState = {
        ...publicState,
        myWord: p.assignedWord || '',
        amImpostor: p.isImpostor || false,
      };

      // Solo revelar al impostor al final del juego
      if (this.state !== 'FINISHED') {
        privateState.impostorUserId = undefined;
      }

      this.broadcastCallback('game_state_update', {
        targetUserId: p.userId,
        state: privateState,
      });
    }
  }

  private getPublicState(): ImpostorPublicState {
    return {
      state: this.state,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      timeRemaining: this.timeRemaining,
      players: this.players.map(p => ({
        userId: p.userId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        color: p.color,
        hasVoted: p.hasVoted || false,
        isAlive: p.isAlive || false,
      })),
      roundResults: this.roundResults,
      winner: this.winner,
      impostorUserId: this.state === 'FINISHED' ? (this.impostorUserId || undefined) : undefined,
    };
  }

  // ──────────────────── Host control ────────────────────

  public returnToLobby() {
    this.stopTimer();
    this.state = 'WAITING';
    this.currentRound = 0;
    this.roundResults = [];
    this.winner = null;
    this.impostorUserId = null;
    this.players.forEach(p => {
      p.assignedWord = undefined;
      p.isImpostor = undefined;
      p.hasVoted = false;
      p.votedFor = undefined;
      p.isAlive = true;
    });
    this.broadcastState();
    this.broadcastCallback('return_to_lobby', null);
  }
}
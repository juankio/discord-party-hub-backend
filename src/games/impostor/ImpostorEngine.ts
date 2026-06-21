import { EventEmitter } from 'events';
import type {
  ImpostorGameState,
  ImpostorPlayer,
  ImpostorRoundResult,
} from './ImpostorTypes.js';
import { ImpostorRolesLogic } from './ImpostorRolesLogic.js';
import { ImpostorVotingLogic } from './ImpostorVotingLogic.js';
import { ImpostorUtils } from './ImpostorUtils.js';


export const DISCUSSION_DURATION = 120;
export const VOTING_DURATION = 30;

export const MAX_ROUNDS = 3;

export class ImpostorEngine extends EventEmitter {
  public roomId: string;
  public players: ImpostorPlayer[] = [];
  public state: ImpostorGameState = 'WAITING';

  public currentRound = 0;
  public maxRounds = MAX_ROUNDS;
  public timeRemaining = 0;
  public roundResults: ImpostorRoundResult[] = [];
  public winner: 'innocents' | 'impostor' | null = null;
  public impostorUserId: string | null = null;

  public timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    const existing = this.players.find(p => p.userId === userId);
    if (existing) {
      existing.socketId = socketId;
      existing.nickname = nickname;
      existing.avatarId = avatarId;
      existing.color = color;
      return;
    }
    if (this.state !== 'WAITING') return;
    this.players.push({
      userId, socketId, nickname, avatarId, color,
      isAlive: true, hasVoted: false,
    });
  }

  public removePlayer(userId: string) {
    ImpostorUtils.removePlayer(this, userId);
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) this.broadcastState();
  }

  public startGame() {
    ImpostorRolesLogic.startGame(this);
  }

  public transitionToDiscussion() {
    this.state = 'DISCUSSION';
    this.timeRemaining = DISCUSSION_DURATION;
    this.broadcastMessage('💬 ¡Discusión! Hablen, argumenten y traten de descubrir al impostor.');
    this.broadcastState();
    this.startTimer(() => this.transitionToVoting());
  }

  public transitionToVoting() {
    this.state = 'VOTING';
    this.timeRemaining = VOTING_DURATION;
    this.broadcastMessage('🗳️ ¡Hora de votar! Eligan a quien creen que es el impostor.');
    this.broadcastState();
    this.startTimer(() => ImpostorVotingLogic.processVotes(this));
  }

  public vote(voterId: string, targetId: string) {
    ImpostorVotingLogic.vote(this, voterId, targetId);
  }

  public startTimer(onComplete: () => void) {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        onComplete();
      } else {
        this.broadcastState();
      }
    }, 1000);
  }

  public stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  public broadcastMessage(msg: string) {
    this.emit('game_message', { message: msg });
  }

  public broadcastState() {
    ImpostorUtils.broadcastState(this);
  }

  public returnToLobby() {
    ImpostorUtils.returnToLobby(this);
  }
}

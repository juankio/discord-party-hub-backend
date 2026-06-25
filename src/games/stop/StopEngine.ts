import { EventEmitter } from 'events';
import { 
  StopGameState, StopPlayerState, StopRules, StopPublicState, 
  PlayerAnswers, CategoryVerification
} from './StopTypes.js';
import { StopValidationLogic } from './StopValidationLogic.js';
import { StopScoringLogic } from './StopScoringLogic.js';
import { StopUtils } from './StopUtils.js';

export class StopEngine extends EventEmitter {
  public roomId: string;
  public state: StopGameState = 'LOBBY';
  public players: StopPlayerState[] = [];
  
  public rules: StopRules = { categories: ['Nombre', 'Animal', 'Color', 'Cosa', 'Fruta'], rounds: 5 };
  public currentRound = 0;
  public currentLetter: string | null = null;
  
  public usedLetters: Set<string> = new Set();
  public verifyingData: CategoryVerification[] = [];
  public roundScores: Record<string, number> = {};
  public winnerId: string | null = null;
  
  public collectingTimeout: NodeJS.Timeout | null = null;
  public verifyingDeadline: number | null = null;
  public verifyingTimeout: NodeJS.Timeout | null = null;

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    if (this.players.some(p => p.userId === userId)) return;
    if (this.players.length >= 8) return;

    this.players.push({
      userId, socketId, nickname, avatarId, color,
      isOffline: false, score: 0, invalidatedCount: 0, currentAnswers: {}, submitted: false
    });
    this.broadcastState();
  }

  public removePlayer(userId: string) {
    this.players = this.players.filter(p => p.userId !== userId);
    if (this.players.length === 0) {
      this.state = 'FINISHED';
    }
    this.broadcastState();
  }

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const p = this.players.find(p => p.userId === userId);
    if (p) p.isOffline = isOffline;
    this.broadcastState();
  }

  public startGame(rules: StopRules, lastWinnerId?: string) {
    if (this.players.length < 1) return;
    this.rules = rules;
    if (!this.rules.verificationTime) this.rules.verificationTime = 30;
    if (this.rules.categories.length > 12) this.rules.categories = this.rules.categories.slice(0, 12);
    if (!this.rules.bannedLetters) this.rules.bannedLetters = [];
    
    this.currentRound = 0;
    this.usedLetters.clear();
    this.players.forEach(p => { p.score = 0; p.invalidatedCount = 0; });
    this.startRound();
  }

  public startRound() {
    this.currentRound++;
    if (this.currentRound > this.rules.rounds) return StopUtils.endGame(this);

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const banned = this.rules.bannedLetters || [];
    const available = alphabet.filter(l => !this.usedLetters.has(l) && !banned.includes(l));
    
    if (available.length === 0) return StopUtils.endGame(this);
    
    this.currentLetter = available[Math.floor(Math.random() * available.length)]!;
    this.usedLetters.add(this.currentLetter);

    this.players.forEach(p => { p.currentAnswers = {}; p.submitted = false; });

    this.state = 'PLAYING';
    this.verifyingData = [];
    this.roundScores = {};
    
    this.broadcastState();
  }

  public stopCall(userId: string, answers: PlayerAnswers) {
    StopUtils.stopCall(this, userId, answers);
  }

  public submitAnswers(userId: string, answers: PlayerAnswers) {
    StopUtils.submitAnswers(this, userId, answers);
  }

  public submitAnswer(userId: string, category: string, answer: string) {
    if (this.state !== 'PLAYING') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;
    player.currentAnswers[category] = answer.trim().toLowerCase();
  }

  public voteVeto(userId: string, category: string, targetUserId: string) {
    StopValidationLogic.voteVeto(this, userId, category, targetUserId);
  }

  public finishVerifyingAndScore() {
    StopScoringLogic.finishVerifyingAndScore(this);
  }

  public nextRound() {
    if (this.state !== 'SCORING') return;
    this.startRound();
  }

  public broadcastState() {
    this.emit('game_state_update', { state: StopUtils.getPublicState(this) });
  }
}

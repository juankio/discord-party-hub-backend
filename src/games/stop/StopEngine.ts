import { logger } from '../../core/Logger.js';
import { 
  StopGameState, StopPlayerState, StopRules, StopPublicState, 
  PlayerAnswers, CategoryVerification, AnswerToVerify
} from './StopTypes.js';

export class StopEngine {
  public roomId: string;
  public state: StopGameState = 'LOBBY';
  public players: StopPlayerState[] = [];
  public emitCallback: (event: string, payload?: any) => void;
  
  public rules: StopRules = { categories: ['Nombre', 'Animal', 'Color', 'Cosa', 'Fruta'], rounds: 5 };
  public currentRound = 0;
  public currentLetter: string | null = null;
  
  private usedLetters: Set<string> = new Set();
  public verifyingData: CategoryVerification[] = [];
  public roundScores: Record<string, number> = {};
  public winnerId: string | null = null;
  
  private collectingTimeout: NodeJS.Timeout | null = null;

  constructor(roomId: string, emitCallback: (event: string, payload?: any) => void) {
    this.roomId = roomId;
    this.emitCallback = emitCallback;
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    if (this.players.some(p => p.userId === userId)) return;
    if (this.players.length >= 8) return;

    this.players.push({
      userId,
      socketId,
      nickname,
      avatarId,
      color,
      isOffline: false,
      score: 0,
      currentAnswers: {},
      submitted: false
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
    if (this.rules.categories.length > 12) {
      this.rules.categories = this.rules.categories.slice(0, 12);
    }
    this.currentRound = 0;
    this.usedLetters.clear();
    this.players.forEach(p => p.score = 0);
    this.startRound();
  }

  private startRound() {
    this.currentRound++;
    if (this.currentRound > this.rules.rounds) {
      this.endGame();
      return;
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const available = alphabet.filter(l => !this.usedLetters.has(l));
    if (available.length === 0) {
      this.endGame();
      return;
    }
    
    this.currentLetter = available[Math.floor(Math.random() * available.length)]!;
    this.usedLetters.add(this.currentLetter);

    this.players.forEach(p => {
      p.currentAnswers = {};
      p.submitted = false;
    });

    this.state = 'PLAYING';
    this.verifyingData = [];
    this.roundScores = {};
    
    this.broadcastState();
  }

  public stopCall(userId: string, answers: PlayerAnswers) {
    if (this.state !== 'PLAYING') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;

    player.currentAnswers = this.cleanAnswers(answers);
    player.submitted = true;

    // We keep state as PLAYING internally but emit stop_called to force others to submit
    this.emitCallback('stop_called', { userId: player.userId });

    // Wait max 3 seconds for others to submit their partial answers
    this.collectingTimeout = setTimeout(() => {
      this.startVerifying();
    }, 3000);
  }

  public submitAnswers(userId: string, answers: PlayerAnswers) {
    if (this.state !== 'PLAYING') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player) return;
    
    player.currentAnswers = this.cleanAnswers(answers);
    player.submitted = true;

    const allSubmitted = this.players.filter(p => !p.isOffline).every(p => p.submitted);
    if (allSubmitted && this.collectingTimeout) {
      clearTimeout(this.collectingTimeout);
      this.collectingTimeout = null;
      this.startVerifying();
    }
  }

  private cleanAnswers(answers: PlayerAnswers): PlayerAnswers {
    const cleaned: PlayerAnswers = {};
    for (const cat of this.rules.categories) {
      const val = answers[cat];
      if (typeof val === 'string') {
        cleaned[cat] = val.trim().toLowerCase();
      } else {
        cleaned[cat] = '';
      }
    }
    return cleaned;
  }

  private startVerifying() {
    this.state = 'VERIFYING';
    this.verifyingData = [];

    for (const cat of this.rules.categories) {
      const catVerif: CategoryVerification = { category: cat, answers: [] };
      for (const p of this.players) {
        if (p.isOffline) continue;
        const ans = p.currentAnswers[cat] || '';
        catVerif.answers.push({
          userId: p.userId,
          answer: ans,
          vetos: [],
          finalPoints: 0
        });
      }
      this.verifyingData.push(catVerif);
    }

    this.broadcastState();
  }

  public voteVeto(userId: string, category: string, targetUserId: string) {
    if (this.state !== 'VERIFYING') return;
    if (userId === targetUserId) return; // Cant veto yourself
    
    const catVerif = this.verifyingData.find(c => c.category === category);
    if (!catVerif) return;

    const targetAns = catVerif.answers.find(a => a.userId === targetUserId);
    if (!targetAns) return;
    if (targetAns.answer === '') return; // Empty answers already 0

    const vetoIndex = targetAns.vetos.indexOf(userId);
    if (vetoIndex === -1) {
      targetAns.vetos.push(userId);
    } else {
      targetAns.vetos.splice(vetoIndex, 1);
    }

    this.broadcastState();
  }

  public finishVerifyingAndScore() {
    if (this.state !== 'VERIFYING') return;
    
    const activePlayers = this.players.filter(p => !p.isOffline).length;
    const threshold = Math.floor(activePlayers / 2); // >50% means if 4 players, need 2 or more vetos (wait >50% means > 4/2 = 2, so 3. Actually let's use strict > 50% => vetos.length > activePlayers / 2).

    for (const catVerif of this.verifyingData) {
      const answersMap = new Map<string, AnswerToVerify[]>();

      for (const ans of catVerif.answers) {
        if (ans.answer === '') {
          ans.finalPoints = 0;
          continue;
        }

        const isVetoed = ans.vetos.length > threshold || !ans.answer.toLowerCase().startsWith(this.currentLetter!.toLowerCase());
        
        if (isVetoed) {
          ans.finalPoints = 0;
        } else {
          const lowerAns = ans.answer;
          if (!answersMap.has(lowerAns)) answersMap.set(lowerAns, []);
          answersMap.get(lowerAns)!.push(ans);
        }
      }

      for (const [_, ansGroup] of answersMap.entries()) {
        const pts = ansGroup.length === 1 ? 100 : 50;
        for (const ans of ansGroup) {
          ans.finalPoints = pts;
        }
      }
    }

    this.roundScores = {};
    for (const p of this.players) {
      if (p.isOffline) continue;
      let roundTotal = 0;
      for (const catVerif of this.verifyingData) {
        const targetAns = catVerif.answers.find(a => a.userId === p.userId);
        if (targetAns) roundTotal += targetAns.finalPoints;
      }
      this.roundScores[p.userId] = roundTotal;
      p.score += roundTotal;
    }

    this.state = 'SCORING';
    this.broadcastState();
  }

  public nextRound() {
    if (this.state !== 'SCORING') return;
    this.startRound();
  }

  private endGame() {
    this.state = 'FINISHED';
    
    let maxScore = -1;
    let winner: StopPlayerState | null = null;
    for (const p of this.players) {
      if (p.score > maxScore) {
        maxScore = p.score;
        winner = p;
      }
    }
    
    if (winner) {
      this.winnerId = winner.userId;
      this.emitCallback('player_won', winner.userId);
    }
    
    this.broadcastState();
  }

  public broadcastState() {
    const publicState: StopPublicState = {
      state: this.state,
      players: this.players.map(p => ({
        userId: p.userId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        color: p.color,
        isOffline: p.isOffline,
        score: p.score,
        submitted: p.submitted
      })),
      currentRound: this.currentRound,
      totalRounds: this.rules.rounds,
      currentLetter: this.currentLetter,
      categories: this.rules.categories,
      verifyingCategoryIndex: 0, // Frontend handles pagination if needed
      verifyingData: this.verifyingData.length > 0 ? this.verifyingData : null,
      roundScores: Object.keys(this.roundScores).length > 0 ? this.roundScores : null,
      winnerId: this.winnerId
    };

    this.emitCallback('game_state_update', { state: publicState });
  }
}

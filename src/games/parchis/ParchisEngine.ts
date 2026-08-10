import type { Server } from 'socket.io';
import { BaseGameEngine } from '../../shared/BaseGameEngine.js';
import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';
import { ParchisBoardLogic } from './ParchisBoardLogic.js';
import { ParchisSetupLogic } from './ParchisSetupLogic.js';

export class ParchisEngine extends BaseGameEngine<ParchisPlayer> {
  public rules: ParchisRules;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  public diceValue: number[] = [];
  public availableMoves: number[] = [];
  public consecutivePairs: number = 0;
  public lastMovedTokenId: string | null = null;
  public rollAttempts: number = 0;
  
  public initiativeRolls: Record<string, number> = {};
  public firstPickerUserId: string | null = null;
  public pickersQueue: string[] = [];
  public takenSeats: number[] = [];

  public get sides() { return this.rules.parchisBoardSize || 4; }
  public get trackLength() { return this.sides * 17; }
  public get maxPos() { return 105; }

  public getPlayerColorIndex(userId: string): number {
    const player = this.players.find(p => p.userId === userId);
    if (!player) return 0;
    const colorNames = ['yellow', 'green', 'red', 'blue', 'purple', 'orange', 'pink', 'cyan'];
    const idx = colorNames.indexOf(player.color?.toLowerCase());
    return idx !== -1 ? idx : this.players.findIndex(p => p.userId === userId);
  }

  constructor(roomId: string, io: Server) {
    super(roomId, io);
    this.rules = {
      diceCount: 2, tokensPerPlayer: 4, parchisBoardSize: 4,
      safeZones: [4, 16, 21, 33, 38, 50, 55, 67], exactMeta: true,
      captureReward: 0, crownReward: 0
    };
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    const existing = this.players.find(p => p.userId === userId);
    if (existing) {
      existing.socketId = socketId;
      existing.nickname = nickname;
      existing.avatarId = avatarId;
      if (this.state === 'LOBBY' || this.state === 'CHOOSING_TOKENS' || this.state === 'ROLLING_FOR_ORDER') {
        existing.color = color;
      }
      existing.isOffline = false;
      return;
    }
    this.players.push({ 
      userId, socketId, nickname, avatarId, color, tokens: [], isOffline: false, hasChosenFigure: false,
      stats: { eaten: 0, died: 0, crowned: 0 }
    });
  }

  public removePlayer(userId: string) {
    this.players = this.players.filter(p => p.userId !== userId);
    this.checkVictoryBySurrender();
    this.broadcastState();
  }

  public surrender(userId: string) {
    if (this.state !== 'PLAYING' && this.state !== 'CHOOSING_TOKENS') return;
    this.removePlayer(userId);
  }

  private checkVictoryBySurrender() {
    if ((this.state === 'PLAYING' || this.state === 'CHOOSING_TOKENS') && this.players.length === 1) {
      this.winner = this.players[0].userId;
      this.state = 'FINISHED';
      this.emit('player_won', this.winner);
    } else if (this.players.length === 0) {
      this.state = 'FINISHED';
    }
  }

  public override autoPlayOfflinePlayer(userId: string) {
    if (this.state === 'CHOOSING_TOKENS') {
      const player = this.players.find(p => p.userId === userId);
      if (player && !player.hasChosenFigure) {
        const availableFigures = ["1", "2", "3", "4", "5", "6"].filter(f => !this.players.some(p => p.selectedFigure === f));
        if (availableFigures.length > 0) this.chooseFigure(userId, availableFigures[0]);
      }
    } else if (this.state === 'ROLLING_FOR_ORDER') {
      if (!this.initiativeRolls[userId]) {
        this.rollInitiative(userId);
      }
    } else if (this.state === 'CHOOSING_SEATS') {
      if (this.firstPickerUserId === userId) {
        const availableSeats = [];
        for (let i = 0; i < this.sides; i++) {
          if (!this.takenSeats.includes(i)) availableSeats.push(i);
        }
        if (availableSeats.length > 0) {
          this.chooseSeat(userId, availableSeats[0]);
        }
      }
    } else if (this.state === 'PLAYING') {
      if (this.players[this.currentTurnIndex]?.userId === userId) {
         this.nextTurn();
      }
    }
  }

  public startGame(rules?: Partial<ParchisRules>) { ParchisSetupLogic.startGame(this, rules); }
  public chooseFigure(userId: string, figureId: string) { ParchisSetupLogic.chooseFigure(this, userId, figureId); }
  public rollInitiative(userId: string) { ParchisSetupLogic.rollInitiative(this, userId); }
  public chooseSeat(userId: string, targetColorIndex: number) { ParchisSetupLogic.chooseSeat(this, userId, targetColorIndex); }

  public rollDice(userId: string) { ParchisTurnLogic.rollDice(this, userId); }
  public moveToken(userId: string, tokenId: string, diceValue: number) { ParchisBoardLogic.moveToken(this, userId, tokenId, diceValue); }
  public nextTurn() { ParchisTurnLogic.nextTurn(this); }

  public override broadcastState() {
    const state: ParchisPublicState = {
      state: this.state, players: this.players, currentTurnIndex: this.currentTurnIndex,
      rules: this.rules, diceValue: this.diceValue, availableMoves: this.availableMoves,
      consecutivePairs: this.consecutivePairs, winner: this.winner,
      initiativeRolls: this.initiativeRolls, firstPickerUserId: this.firstPickerUserId,
      pickersQueue: this.pickersQueue, takenSeats: this.takenSeats
    };
    this.players.forEach(p => this.emit('game_state_update', { targetUserId: p.userId, state }));
  }
}

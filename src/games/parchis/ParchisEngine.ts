import { EventEmitter } from 'events';
import type { ParchisPlayer, ParchisRules, ParchisGameState, ParchisPublicState } from './ParchisTypes.js';
import { ParchisTurnLogic } from './ParchisTurnLogic.js';
import { ParchisBoardLogic } from './ParchisBoardLogic.js';

export class ParchisEngine extends EventEmitter {
  public roomId: string;
  public players: ParchisPlayer[] = [];
  public rules: ParchisRules;
  public winner: string | null = null;
  public state: ParchisGameState = 'LOBBY';
  public currentTurnIndex: number = 0;
  public diceValue: number[] = [];
  public availableMoves: number[] = [];
  public consecutivePairs: number = 0;
  public lastMovedTokenId: string | null = null;
  public rollAttempts: number = 0;

  public get sides() { return this.rules.parchisBoardSize || 4; }
  public get trackLength() { return this.sides * 17; }
  public get maxPos() { return 105; }

  constructor(roomId: string) {
    super();
    this.roomId = roomId;
    this.rules = {
      diceCount: 1, tokensPerPlayer: 4, parchisBoardSize: 4,
      safeZones: [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67], exactMeta: true
    };
  }

  public addPlayer(userId: string, socketId: string, nickname: string, avatarId: number, color: string) {
    if (this.players.find(p => p.userId === userId)) return;
    this.players.push({ userId, socketId, nickname, avatarId, color, tokens: [], isOffline: false, hasChosenFigure: false });
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

  public setPlayerOffline(userId: string, isOffline: boolean) {
    const player = this.players.find(p => p.userId === userId);
    if (player) { player.isOffline = isOffline; this.broadcastState(); }
  }

  public startGame(rules?: Partial<ParchisRules>) {
    if (rules) this.rules = { ...this.rules, ...rules };
    if (!this.rules.parchisBoardSize) this.rules.parchisBoardSize = 4;

    const safeZones: number[] = [];
    for (let i = 0; i < this.rules.parchisBoardSize; i++) {
      const base = i * 17;
      safeZones.push(base + 4, base + 12, base + 16);
    }
    
    if (this.rules.parchisBoardSize === 4) this.rules.safeZones = [4, 11, 16, 21, 28, 33, 38, 45, 50, 55, 62, 67];
    else this.rules.safeZones = safeZones;

    this.players.forEach(p => { p.hasChosenFigure = false; p.selectedFigure = undefined; });
    Object.assign(this, { state: 'CHOOSING_TOKENS', currentTurnIndex: 0, diceValue: [], availableMoves: [], consecutivePairs: 0, lastMovedTokenId: null, rollAttempts: 0 });
    this.broadcastState();
  }

  public chooseFigure(userId: string, figureId: string) {
    if (this.state !== 'CHOOSING_TOKENS') return;
    const player = this.players.find(p => p.userId === userId);
    if (!player || player.hasChosenFigure) return;

    player.selectedFigure = figureId;
    player.hasChosenFigure = true;

    if (this.players.every(p => p.isOffline || p.hasChosenFigure)) {
      this.players.forEach(p => {
        p.tokens = Array.from({ length: this.rules.tokensPerPlayer }, (_, i) => ({
          id: `${p.userId}-token-${i}`, color: p.color, ownerId: p.userId, position: -1, state: 'HOME'
        }));
      });
      this.state = 'PLAYING';
    }
    this.broadcastState();
  }

  public rollDice(userId: string) { ParchisTurnLogic.rollDice(this, userId); }
  public moveToken(userId: string, tokenId: string, diceValue: number) { ParchisBoardLogic.moveToken(this, userId, tokenId, diceValue); }
  public nextTurn() { ParchisTurnLogic.nextTurn(this); }

  public broadcastState() {
    const state: ParchisPublicState = {
      state: this.state, players: this.players, currentTurnIndex: this.currentTurnIndex,
      rules: this.rules, diceValue: this.diceValue, availableMoves: this.availableMoves,
      consecutivePairs: this.consecutivePairs, winner: this.winner
    };
    this.players.forEach(p => this.emit('game_state_update', { targetUserId: p.userId, state }));
  }
}
